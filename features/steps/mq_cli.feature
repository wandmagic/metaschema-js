Feature: METASCHEMA CLI Wrapper

  Scenario: Check METASCHEMA CLI installation
    When I check if METASCHEMA CLI is installed
    Then I should receive a boolean result

  Scenario: Install METASCHEMA CLI
    Given METASCHEMA CLI is not installed
    When I install METASCHEMA CLI
    Then METASCHEMA CLI should be installed
