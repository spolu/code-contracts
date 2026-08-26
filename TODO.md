## cc-check

- [ ] `cc-check check <file-like>`
       Check that the @cc directive are compliant to the grammar
- [ ] `cc-check callers <file-line-like>`
- [ ] `cc-check list <file-line-or-range-like>`
       Lists all contracts related to the position pointed (local declaration, potential parent
       declaration (eg a class), and directory contracts). The range-like argument is optional and
       defaults to the whole file.
 
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
