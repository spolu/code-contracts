"use strict";

const examples = {
  specification: {
    file: "payments.ts",
    scope: "function scope",
    caption: "Specify the failure, and what it must leave untouched.",
  },
  invariant: {
    file: "payments.ts",
    scope: "function scope",
    caption: "Name the guarantee that must survive the next refactor.",
  },
  rule: {
    file: "CONTRACTS",
    scope: "directory scope",
    caption: "A rule for this directory and every directory beneath it.",
  },
};

const picker = document.querySelector(".example-picker");
const exampleCode = document.querySelector("#example-code");

function selectExample(name) {
  const example = examples[name];
  const template = document.querySelector(`#example-${name}`);
  exampleCode.replaceChildren(template.content.cloneNode(true));
  document.querySelector("#example-file").textContent = example.file;
  document.querySelector("#example-scope").textContent = example.scope;
  document.querySelector("#example-caption").textContent = `↳ ${example.caption}`;
  for (const button of picker.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.example === name));
  }
}

for (const button of picker.querySelectorAll("button")) {
  button.addEventListener("click", () => selectExample(button.dataset.example));
}
picker.hidden = false;

for (const button of document.querySelectorAll("[data-copy]")) {
  button.hidden = false;
  button.addEventListener("click", async () => {
    const command = document.getElementById(button.dataset.copy);
    const feedback = document.querySelector(".copy-feedback");
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(command.textContent.trim());
      button.textContent = "Copied ✓";
      feedback.textContent = "Command copied to clipboard.";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(command);
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "Select & copy";
      feedback.textContent = "Copy was unavailable. The command is selected; copy it manually.";
    } finally {
      button.disabled = false;
    }
  });
}
