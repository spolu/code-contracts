## cc-check

- [x] `cc-check check <file-like>` (TypeScript prototype)
       Check that the @cc directive are compliant to the grammar
- [x] `cc-check callers <location-like>` (TypeScript prototype)
- [x] `cc-check references <location-like>` (TypeScript prototype)
- [x] `cc-check list <location-like>` (TypeScript prototype)
       Lists all contracts related to the pointed location (local declaration, potential parent
       declaration (eg a class), and directory contracts).
 
## Skill

- [ ] @cc definition and usage directives
- [ ] cc-check usage

## DeepSWE eval

- [ ] setup new agent with cc-check on top of mini-swe-agent to ablate presence of the skill

## Syntax inspiration

 - See JML https://www.openjml.org/tutorial/Syntax (syntax for logical conditions)
 - See Doxygen https://www.doxygen.nl/manual/requirements.html (@requirement)
 - See EARS https://alistairmavin.com/ears/ (system requirements)
 - See BCP 14 https://www.rfc-editor.org/info/bcp14 (requirement levels)
 - See Gherkin https://cucumber.io/docs/gherkin/reference/ (feature files)
 - See OpenFastTrace
   https://github.com/itsallcode/openfasttrace/blob/main/doc/user_guide/user_guide.md (product
   requirement files)
 - See Sphinx-Needs: https://sphinx-needs.readthedocs.io/en/stable/index.html (doc as code and
   requirement)
