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

function numberCodeLines() {
  const lines = [document.createElement("span")];
  function appendLines(node, parentClass = "") {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = node.textContent.split("\n");
      for (const [index, part] of parts.entries()) {
        if (index > 0) lines.push(document.createElement("span"));
        const text = document.createElement("span");
        text.className = parentClass;
        text.textContent = part;
        lines.at(-1).append(text);
      }
    } else {
      for (const child of node.childNodes) {
        appendLines(child, node.className || parentClass);
      }
    }
  }
  for (const node of exampleCode.childNodes) appendLines(node);
  const output = document.createDocumentFragment();
  for (const [index, line] of lines.entries()) {
    line.className = "source-line";
    line.dataset.line = String(index + 1).padStart(2, "0");
    output.append(line);
    if (index < lines.length - 1) output.append("\n");
  }
  exampleCode.replaceChildren(output);
}

function selectExample(name) {
  const example = examples[name];
  const template = document.querySelector(`#example-${name}`);
  exampleCode.replaceChildren(template.content.cloneNode(true));
  numberCodeLines();
  document.querySelector("#example-file").textContent = example.file;
  document.querySelector("#example-scope").textContent = example.scope;
  document.querySelector("#example-caption-text").textContent = example.caption;
  for (const button of picker.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.example === name));
  }
}

numberCodeLines();
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
