function setupCopyButtons() {
  const buttons = document.querySelectorAll("[data-copy-target]");

  for (const button of buttons) {
    button.addEventListener("click", async () => {
      const targetId = button.getAttribute("data-copy-target");
      const target = targetId ? document.getElementById(targetId) : null;

      if (!target) {
        return;
      }

      const content = target.textContent ?? "";

      try {
        await navigator.clipboard.writeText(content.trim());
        const original = button.textContent;
        button.textContent = "Copied";
        window.setTimeout(() => {
          button.textContent = original;
        }, 1600);
      } catch {
        button.textContent = "Copy failed";
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupCopyButtons();
});
