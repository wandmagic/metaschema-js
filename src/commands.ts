import AdmZip from 'adm-zip';
import chalk from 'chalk';
import { exec, execSync, spawn } from 'child_process';
import { program } from 'commander';
import fs, { existsSync, readFileSync, rmSync } from 'fs';
import inquirer from 'inquirer';
import yaml from 'js-yaml'; // Make sure to import js-yaml
import path, { dirname, join } from 'path';
import { Log } from "sarif";
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { v4 } from 'uuid';
import xml2js from 'xml2js';
const MAVEN_METADATA_URL = 'https://repo1.maven.org/maven2/dev/metaschema/java/metaschema-cli/maven-metadata.xml';
const MAVEN_DOWNLOAD_URL = (version:string)=> `https://repo1.maven.org/maven2/dev/metaschema/java/metaschema-cli/${version}/metaschema-cli-${version}-metaschema-cli.zip`;



async function getVersionsFromMaven() {
  try {
    const response = await fetch(MAVEN_METADATA_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const xmlData = await response.text();
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlData);

    const versions = result.metadata.versioning[0].versions[0].version.sort();
    const latestVersion = result.metadata.versioning[0].release[0];

    return { versions, latestVersion };
  } catch (error) {
    console.error('Error fetching versions from Maven:', error);
    throw error;
  }
}

async function downloadFromMaven(version) {
  
  try {
    console.log(`Downloading version ${version} from ${MAVEN_DOWNLOAD_URL(version)}`);
    const response = await fetch(MAVEN_DOWNLOAD_URL(version));
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return  await response.arrayBuffer();
    console.log(`Successfully downloaded version ${version}`);
  } catch (error) {
    console.error(`Error downloading version ${version}:`, error);
    throw error;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type MetaschemaDocumentType = 'Metaschema' |"MetaConstraints";
type FileFormat = 'xml' | 'json' | 'yaml';


export async function detectMetaschemaDocumentType(filePath: string): Promise<[MetaschemaDocumentType, FileFormat]> {
  const fileExtension = path.extname(filePath).toLowerCase();

  if (!['.xml', '.json', '.yaml', '.yml'].includes(fileExtension)) {
    throw new Error('Unsupported file format. Only XML YAML and JSON are supported.');
  }

  const fileContent = (await readFileSync(filePath)).toString();

  if (fileExtension === '.xml') {
    return parseXmlDocument(fileContent);
  } else if (fileExtension === ".json") {
    return parseJsonDocument(fileContent);
  } else {
    return parseYamlDocument(fileContent);
  }
}
async function parseYamlDocument(fileContent: string): Promise<[MetaschemaDocumentType, FileFormat]> {
  return new Promise((resolve, reject) => {
    try {
      const yamlData = yaml.load(fileContent);
      if (typeof yamlData !== 'object' || yamlData === null) {
        reject(new Error('Invalid YAML structure'));
      }
      const rootElement = Object.keys(yamlData)[0];
      resolve([getDocumentType(rootElement), 'yaml']);
    } catch (error) {
      reject(new Error(`Failed to parse YAML: ${error}`));
    }
  });
}
async function parseXmlDocument(fileContent: string): Promise<[MetaschemaDocumentType, FileFormat]> {
  const parser = new xml2js.Parser();
  try {
    const result = await parser.parseStringPromise(fileContent);
    const rootElement = Object.keys(result)[0];
    return [getDocumentType(rootElement), 'xml'];
  } catch (error) {
    throw new Error(`Failed to parse XML: ${error}`);
  }
}

function parseJsonDocument(fileContent: string): [MetaschemaDocumentType, FileFormat] {
  try {
    const jsonData = JSON.parse(fileContent);
    const rootElement = Object.keys(jsonData)[0];
    return [getDocumentType(rootElement), 'json'];
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error}`);
  }
}

function getDocumentType(rootElement: string): MetaschemaDocumentType {
  switch (rootElement) {
    case 'metaschema-meta-constraints': return 'MetaConstraints';
    case 'METASCHEMA': return 'Metaschema';
    default: return 'Metaschema';
  }
}

const checkCommand = (command: string): Promise<boolean> => {
  return new Promise((resolve) => {
    exec(command, (error) => {
      resolve(!error);
    });
  });
};

export const isMetaschemaCliInstalled = async (): Promise<boolean> => {
  const command = process.platform === 'win32' 
    ? 'where metaschema-cli'
    : 'which metaschema-cli';
  
  const isInPath = await checkCommand(command);
  if (isInPath) return true;

  const metaschemaCliInstallPath = path.join('.', 'metaschema-cli');
  return fs.existsSync(metaschemaCliInstallPath);
};

export const isJavaInstalled = async (): Promise<boolean> => {
  const command = process.platform === 'win32'
    ? 'where java'
    : 'which java';
  
  return checkCommand(command);
};


export const installMetaschemaCli = async (version = "latest"): Promise<void> => {
  try {
    const { versions, latestVersion } = await getVersionsFromMaven();
    
    if (version === "latest") {
      version = latestVersion;
    } else if (!versions.includes(version)) {
      console.error("Unknown METASCHEMA version: " + version);
      console.error(chalk.blue(versions.join(', ')));
      return;
    }

    console.log("Installing version:", chalk.blue(version));

    const isWindows = process.platform === 'win32';
    const npmPrefix = execSync('npm config get prefix').toString().trim();

    const binPath = isWindows ? npmPrefix : path.join(npmPrefix, 'bin');
    const metaschemaCliPath = path.join(npmPrefix, 'lib', 'node_modules', 'metaschema-cli');
    const metaschemaCliExecutablePath = path.join(metaschemaCliPath, 'bin', 'metaschema-cli');

    // Create necessary directories
    fs.mkdirSync(metaschemaCliPath, { recursive: true });

    // Download the zip file
    console.log(`Downloading METASCHEMA CLI...`);
    const zipBuffer = await downloadFromMaven(version);

    // Unzip the file to metaschema-cli directory
    console.log(`Extracting METASCHEMA CLI...`);
    const zip = new AdmZip(Buffer.from(zipBuffer));
    zip.extractAllTo(metaschemaCliPath, true);

    // Make the CLI executable (for non-Windows systems)
    if (!isWindows) {
      console.log("Setting executable permissions for CLI at " + metaschemaCliExecutablePath);
      fs.chmodSync(metaschemaCliExecutablePath, '755');
    }

    // Create a shortcut (Windows) or symbolic link (other systems)
    console.log(`Creating METASCHEMA CLI symlink: metaschema-cli => ${metaschemaCliExecutablePath}`);
    const sourceFile = isWindows ? `${metaschemaCliExecutablePath}.bat` : metaschemaCliExecutablePath;
    const aliasPath = path.join(binPath, 'metaschema-cli' + (isWindows ? '.bat' : ''));

    if (fs.existsSync(aliasPath)) {
      fs.unlinkSync(aliasPath); // Remove existing alias if it exists
    }

    if (isWindows) {
      const batchContent = `@echo off\n"${sourceFile}" %*`;
      fs.writeFileSync(aliasPath, batchContent, { flag: "w" });
    } else {
      fs.symlinkSync(sourceFile, aliasPath, 'file');
    }

    console.log(`METASCHEMA CLI installed to ${metaschemaCliPath}`);
    console.log(`Alias created at ${aliasPath}`);

  } catch (error: any) {
    throw new Error(`Failed to install METASCHEMA CLI: ${error.message}`);
  }
};
const execPromise = promisify(exec);
export type stdIn = string;
export type stdErr = string;

export const executeMetaschemaCliCommand = async (command: string, args: string[], showLoader: boolean = false): Promise<[stdIn, stdErr]> => {
  return new Promise((resolve, reject) => {
    findMetaschemaCliPath().then(metaschemaCliPath => {
      const isWindows = process.platform === 'win32';
      const fullArgs = [command, ...args];

      console.log(chalk.green("metaschema-cli ") + chalk.blue(command)+' '+(args.join(" ")));

      let spawnArgs: [string, string[], object];
      if (isWindows) {
        // On Windows, we need to spawn cmd.exe and pass the command as an argument
        spawnArgs = [
          'cmd.exe',
          ['/c', metaschemaCliPath, ...fullArgs],
          { windowsVerbatimArguments: true }
        ];
      } else {
        spawnArgs = [metaschemaCliPath, fullArgs, {}];
      }

      const metaschemaCliProcess = spawn(...spawnArgs);

      let stdout = '';
      let stderr = '';

      // Indeterminate loading glyph
      const loadingGlyph = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let loadingIndex = 0;

      let loading: NodeJS.Timeout | null = null;
      if (showLoader) {
        loading = setInterval(() => {
          process.stdout.write(`\r\x1b[36m${loadingGlyph[loadingIndex]}\x1b[0m`);
          loadingIndex = (loadingIndex + 1) % loadingGlyph.length;
        }, 100);
      }

      metaschemaCliProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      metaschemaCliProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      metaschemaCliProcess.on('error', (error) => {
        if (loading) clearInterval(loading);
        reject(new Error(`Failed to start METASCHEMA CLI process: ${error.message}`));
      });

      metaschemaCliProcess.on('close', (code) => {
        if (loading) {
          clearInterval(loading);
          process.stdout.write('\r\x1b[K'); // Clear the loading glyph line
        }

        if (code === 0) {
          resolve([stdout, stderr]);
        } else {
          reject(new Error(`METASCHEMA CLI process exited with code ${code}:\n${stderr}`));
        }
      });
    }).catch(error => reject(error));
  });
};
export const validateWithSarif = async (args: string[]): Promise<Log> => {
  const tempFile = path.join(`metaschema-cli-sarif-log-${v4()}.json`);
  const sarifArgs = [...args, '-o', tempFile, "--sarif-include-pass", '--show-stack-trace'];
  var consoleErr = ""
  try {
    const [out, err] = await executeMetaschemaCliCommand('validate', sarifArgs, false);
    consoleErr = err;
    console.log(out);
    console.error(chalk.red(err));
  } catch (error) {
    console.error(chalk.red(error));
    if (!existsSync(tempFile)) {
      throw (consoleErr)
    }
    const sarifOutput = readFileSync(tempFile, 'utf8');
    rmSync(tempFile);
    return JSON.parse(sarifOutput) as Log;
  }
  try {
    const sarifOutput = readFileSync(tempFile, 'utf8');
    rmSync(tempFile);
    return JSON.parse(sarifOutput) as Log;
  } catch (error) {
    throw new Error(`Failed to read or parse SARIF output: ${error}`);
  }
};

const findMetaschemaCliPath = async (): Promise<string> => {
  const command = process.platform === 'win32' ? 'where metaschema-cli' : 'which metaschema-cli';

  try {
    const { stdout } = await execPromise(command);
    const paths = stdout.trim().split('\n');
    if (paths.length > 0) {
      return paths[0]; // Return the first found path
    }
  } catch (error) {
    // Command failed or metaschema-cli not found
  }

  throw new Error("METASCHEMA CLI not found");
};


function isValidFileType(filePath: string): boolean {
  const validExtensions = ['.xml', '.json', '.yaml', '.yml'];
  return validExtensions.includes(path.extname(filePath).toLowerCase());
}






  program
  .command('use [version]')
  .description('Install or switch to a specific METASCHEMA CLI version')
  .action(async (version) => {
    const {versions}= await getVersionsFromMaven();
    if (!version) {
      const choices = (versions.reverse()).map(v => ({
        name: v,
        value: v
      }))
      
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedVersion',
          message: 'Select the METASCHEMA CLI version to install:',
          choices: [{ name: 'latest', value: 'latest' },...choices, ]
        }
      ]);
      
      version = answer.selectedVersion;
    }
    
    if (!versions.includes(version) && version !== 'latest') {
      console.error(chalk.red(`Unknown version: ${version}`));
      console.log(chalk.yellow('Available versions:'));
      Object.keys(versions).forEach(v => console.log(chalk.blue(`- ${v}`)));
      console.log(chalk.blue(`- latest`));
      return;
    }
    
    await installMetaschemaCli(version);
  });


  export const run = () => {
    const args = process.argv.slice(2);
    const command = args[0];
  
    if (command === 'use') {
      // If the command is 'use', directly parse the arguments without checking for METASCHEMA CLI installation
      program.parse(process.argv);
    } else {
      // For all other commands, check for METASCHEMA CLI installation first
      isMetaschemaCliInstalled()
        .then((installed) => {
          if (!installed) {
            return installMetaschemaCli();
          }
        })
        .then(() => {
          program.parse(process.argv);
        })
        .catch((error) => {
          console.error('Error:', error);
          process.exit(1);
        });
    }
  };