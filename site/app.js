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

const film = document.getElementById("demo-video");
const chapters = [...document.querySelectorAll("[data-seek]")];
const filmMedia = matchMedia("(max-width: 600px)");
function chooseFilm() {
  const time = film.currentTime || 0;
  const paused = film.paused;
  film.poster = filmMedia.matches
    ? "assets/recording-poster-phone.webp"
    : "assets/recording-poster.webp";
  film.src = filmMedia.matches
    ? "assets/real-run-phone.mp4"
    : "assets/real-run.mp4";
  film.addEventListener(
    "loadedmetadata",
    () => {
      if (time > 0) film.currentTime = Math.min(time, film.duration || time);
      if (!paused) film.play().catch(() => {});
    },
    { once: true },
  );
}
chooseFilm();
filmMedia.addEventListener("change", chooseFilm);
const playFilm = document.querySelector(".film-play");
const posterPlay = document.querySelector(".poster-play");
posterPlay.hidden = false;
posterPlay.addEventListener("click", () => {
  film
    .play()
    .catch(() =>
      notify("The recording could not play. Use Download film to watch it."),
    );
});
film.addEventListener("play", () => {
  posterPlay.hidden = true;
});
film.addEventListener("error", () => {
  posterPlay.hidden = false;
});
playFilm.addEventListener("click", () => {
  if (film.paused) film.play().catch(() => {});
  else film.pause();
});
film.addEventListener("play", () => {
  playFilm.textContent = "Pause recording Ⅱ";
});
film.addEventListener("pause", () => {
  playFilm.textContent = "Play the 32s run ↗";
});
chapters.forEach((button) => {
  button.addEventListener("click", () => {
    film.currentTime = Number(button.dataset.seek);
    film.play().catch(() => {});
  });
});
film.addEventListener("timeupdate", () => {
  const active = chapters.reduce(
    (last, button) =>
      film.currentTime >= Number(button.dataset.seek) ? button : last,
    chapters[0],
  );
  chapters.forEach((button) =>
    button.setAttribute("aria-pressed", String(button === active)),
  );
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) film.pause();
});
