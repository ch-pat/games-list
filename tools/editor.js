const gamesContainer = document.querySelector("#games");
const searchInput = document.querySelector("#game-search");
const saveButton = document.querySelector("#save-button");
const addGameForm = document.querySelector("#add-game-form");
const newGameTitle = document.querySelector("#new-game-title");
const addGameButton = document.querySelector("#add-game-button");
const statusMessage = document.querySelector("#status");
const countMessage = document.querySelector("#game-count");

let games = [];
let savedGames = [];
let version = "";

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function updateSaveState() {
  const dirty = JSON.stringify(games) !== JSON.stringify(savedGames);
  saveButton.disabled = !dirty;
  setStatus(dirty ? "Unsaved changes" : "All changes saved.");
}

function makeField(labelText, control) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  const label = document.createElement("span");
  label.textContent = labelText;
  wrapper.append(label, control);
  return wrapper;
}

function renderGames() {
  gamesContainer.replaceChildren();
  games.forEach((game, index) => {
    const row = document.createElement("article");
    row.className = "game-row";

    const title = document.createElement("input");
    title.type = "text";
    title.value = game.title;
    title.required = true;
    title.setAttribute("aria-label", `Title for ${game.title}`);
    title.addEventListener("input", () => {
      games[index].title = title.value;
      title.setAttribute("aria-label", `Title for ${title.value || "game"}`);
      row.dataset.title = title.value.toLocaleLowerCase();
      updateSaveState();
      updateVisibleCount();
    });

    const comment = document.createElement("textarea");
    comment.value = game.comment ?? "";
    comment.setAttribute("aria-label", `Comment for ${game.title}`);
    comment.addEventListener("input", () => {
      if (comment.value.trim()) games[index].comment = comment.value;
      else delete games[index].comment;
      updateSaveState();
    });

    const starred = document.createElement("input");
    starred.type = "checkbox";
    starred.checked = Boolean(game.starred);
    starred.setAttribute("aria-label", `Add ${game.title} to Hall of Fame`);
    starred.addEventListener("change", () => {
      if (starred.checked) games[index].starred = true;
      else delete games[index].starred;
      updateSaveState();
    });

    const starLabel = document.createElement("label");
    starLabel.className = "star-field";
    const starText = document.createElement("span");
    starText.textContent = "Hall of Fame";
    starLabel.append(starred, starText);

    row.dataset.title = game.title.toLocaleLowerCase();
    row.append(makeField("Game title", title), makeField("Comment", comment), starLabel);
    gamesContainer.append(row);
  });
  updateVisibleCount();
}

function updateVisibleCount() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  let visible = 0;
  gamesContainer.querySelectorAll(".game-row").forEach((row) => {
    row.hidden = !row.dataset.title.includes(query);
    if (!row.hidden) visible += 1;
  });
  countMessage.textContent = `${visible} of ${games.length} games`;
}

function addGame(event) {
  event.preventDefault();
  const title = newGameTitle.value.trim();
  if (!title) return;

  const duplicate = games.some(
    (game) => game.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase(),
  );
  if (duplicate) {
    setStatus(`"${title}" is already in the catalogue.`, true);
    return;
  }

  games.push({ title });
  newGameTitle.value = "";
  addGameButton.disabled = true;
  searchInput.value = "";
  renderGames();
  updateSaveState();
  gamesContainer.lastElementChild?.querySelector('input[type="text"]')?.focus();
}

async function loadGames() {
  const response = await fetch("/api/games");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Could not load the catalogue.");
  games = payload.games;
  savedGames = structuredClone(games);
  version = payload.version;
  renderGames();
  setStatus("All changes saved.");
}

async function saveGames() {
  const savingGames = structuredClone(games);
  saveButton.disabled = true;
  setStatus("Saving…");
  try {
    const response = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ games: savingGames, version }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not save the catalogue.");
    version = payload.version;
    savedGames = savingGames;
    updateSaveState();
    if (JSON.stringify(games) === JSON.stringify(savedGames)) {
      setStatus("Saved to data/games.json.");
    }
  } catch (error) {
    setStatus(error.message, true);
    saveButton.disabled = false;
  }
}

searchInput.addEventListener("input", updateVisibleCount);
newGameTitle.addEventListener("input", () => {
  addGameButton.disabled = !newGameTitle.value.trim();
});
addGameForm.addEventListener("submit", addGame);
saveButton.addEventListener("click", saveGames);
window.addEventListener("beforeunload", (event) => {
  if (JSON.stringify(games) !== JSON.stringify(savedGames)) event.preventDefault();
});

loadGames().catch((error) => setStatus(error.message, true));
