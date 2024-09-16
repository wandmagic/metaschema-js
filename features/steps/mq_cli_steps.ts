import { Given, setDefaultTimeout, Then, When } from '@cucumber/cucumber';
import Ajv from 'ajv';
import addFormats from "ajv-formats";
import { expect } from 'chai';
import path, { dirname } from 'path';
import { Log } from 'sarif';
import { fileURLToPath } from 'url';
import {
  detectMetaschemaDocumentType,
  executeMetaschemaCliCommand,
  installMetaschemaCli,
  isMetaschemaCliInstalled,
} from '../../src/commands.js';

const DEFAULT_TIMEOUT = 17000;

setDefaultTimeout(DEFAULT_TIMEOUT);


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let documentPath: string;
let constraintId: string;
let constraintExists: boolean;
let outputPath: string;
let metaschemaDocumentPath: string;
let metaschemaDocuments:string[];
let documentType: string;
let cliInstalled: boolean;
let executionResult: string;
let executionErrors: string;
let convertResult: string;
let definitionToValidate: string;
let exampleObject: any;
let sarifResult: Log;
let validateResult: { isValid: boolean; errors?: string[] | undefined; };
let conversionResult: string;

const ajv = new Ajv()
addFormats(ajv);



Given('I have an METASCHEMA document {string}', function (filename: string) {
  documentPath = path.join(__dirname, '..', '..', 'examples', filename);
});

Given('I have an Metaschema extensions document {string}', (filename: string) => {
  metaschemaDocumentPath = path.join(__dirname, '..', '..', 'extensions', filename);
  metaschemaDocuments=[metaschemaDocumentPath];
});
When('I detect the document type', async function () {
  [documentType] = await detectMetaschemaDocumentType(documentPath);
});

Then('the document type should be {string}', function (expectedType: string) {
  expect(documentType).to.equal(expectedType);
});

When('I check if METASCHEMA CLI is installed', async function () {
  cliInstalled = await isMetaschemaCliInstalled();
});

Then('I should receive a boolean result', function () {
  expect(cliInstalled).to.be.a('boolean');
});

Given('METASCHEMA CLI is not installed', async function () {
  cliInstalled = await isMetaschemaCliInstalled();
});

When('I install METASCHEMA CLI', async function () {
  if(!cliInstalled){
    await installMetaschemaCli();
  }
});

Then('METASCHEMA CLI should be installed', async function () {
  cliInstalled = await isMetaschemaCliInstalled();
  expect(cliInstalled).to.be.true;
});

When('I execute the METASCHEMA CLI command {string} on the document', async function (command: string) {
  const [cmd, ...args] = command.split(' ');
  args.push(documentPath);
  [executionResult,executionErrors] = await executeMetaschemaCliCommand(cmd, args);
});

Then('I should receive the execution result', function () {
  expect(executionResult).to.exist;
});



Given('I want an METASCHEMA document {string}', (filename: string) => {
  outputPath = path.join(__dirname, '..', '..', 'examples', filename);
})
