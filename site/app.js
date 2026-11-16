"use strict";
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  tabs.forEach((item) => {
    const active = item === tab;
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
    document.getElementById(item.getAttribute("aria-controls")).hidden =
      !active;
  });
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      selectTab(tabs[next]);
      tabs[next].focus();
    }
  });
});
const dialog = document.getElementById("image-dialog");
const expanded = document.getElementById("expanded-image");
let opener;
document.querySelectorAll("[data-image]").forEach((button) => {
  button.addEventListener("click", () => {
    opener = button;
    expanded.src = button.dataset.image;
    expanded.alt = button.dataset.title + ", full original product screenshot";
    document.getElementById("dialog-title").textContent = button.dataset.title;
    dialog.showModal();
    dialog.scrollTop = 0;
    document.body.style.overflow = "hidden";
  });
});
function closeDialog() {
  dialog.close();
}
document.getElementById("close-dialog").addEventListener("click", closeDialog);
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closeDialog();
  }
});
dialog.addEventListener("close", () => {
  document.body.style.overflow = "";
  opener?.focus({ preventScroll: true });
});
const toast = document.getElementById("toast");
let toastTimer;
function notify(text) {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}
document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copied";
      notify("Command copied");
      setTimeout(() => {
        button.textContent = "Copy";
      }, 2200);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(button.previousElementSibling);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      notify("Select the highlighted command and copy it.");
    }
  });
});
