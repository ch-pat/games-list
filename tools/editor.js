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

function setTextMetadata(game, key, value) {
  const trimmed = value.trim();
  if (trimmed) game[key] = trimmed;
  else delete game[key];
}

function setNumberMetadata(game, key, value) {
  if (value.trim() === "") delete game[key];
  else {
    const number = Number(value);
    if (Number.isInteger(number)) game[key] = number;
  }
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

    const playedYear = document.createElement("input");
    playedYear.type = "number";
    playedYear.min = "1900";
    playedYear.max = "2100";
    playedYear.step = "1";
    playedYear.value = game.play_year ?? game.played_year ?? "";
    playedYear.setAttribute("aria-label", `Played year for ${game.title}`);
    playedYear.addEventListener("input", () => {
      setNumberMetadata(games[index], "play_year", playedYear.value);
      if (playedYear.value.trim() === "") delete games[index].played_year;
      updateSaveState();
    });

    const platform = document.createElement("input");
    platform.type = "text";
    platform.value = game.platform ?? "";
    platform.setAttribute("aria-label", `Platform for ${game.title}`);
    platform.addEventListener("input", () => {
      setTextMetadata(games[index], "platform", platform.value);
      updateSaveState();
    });

    const platforms = document.createElement("input");
    platforms.type = "text";
    platforms.value = Array.isArray(game.platforms) ? game.platforms.join(", ") : "";
    platforms.setAttribute("aria-label", `Platforms for ${game.title}`);
    platforms.addEventListener("input", () => {
      const values = platforms.value.split(",").map((value) => value.trim()).filter(Boolean);
      if (values.length) games[index].platforms = values;
      else delete games[index].platforms;
      updateSaveState();
    });

    const startedOn = document.createElement("input");
    startedOn.type = "text";
    startedOn.value = game.started_on ?? "";
    startedOn.placeholder = "YYYY-MM-DD";
    startedOn.setAttribute("aria-label", `Started date for ${game.title}`);
    startedOn.addEventListener("input", () => {
      setTextMetadata(games[index], "started_on", startedOn.value);
      updateSaveState();
    });

    const beatenOn = document.createElement("input");
    beatenOn.type = "text";
    beatenOn.value = game.beaten_on ?? "";
    beatenOn.placeholder = "YYYY-MM-DD";
    beatenOn.setAttribute("aria-label", `Beaten date for ${game.title}`);
    beatenOn.addEventListener("input", () => {
      setTextMetadata(games[index], "beaten_on", beatenOn.value);
      updateSaveState();
    });

    const playTime = document.createElement("input");
    playTime.type = "text";
    playTime.value = game.play_time ?? "";
    playTime.setAttribute("aria-label", `Play time for ${game.title}`);
    playTime.addEventListener("input", () => {
      setTextMetadata(games[index], "play_time", playTime.value);
      updateSaveState();
    });

    const releaseDate = document.createElement("input");
    releaseDate.type = "text";
    releaseDate.value = game.release_date ?? "";
    releaseDate.placeholder = "YYYY-MM-DD";
    releaseDate.setAttribute("aria-label", `Release date for ${game.title}`);
    releaseDate.addEventListener("input", () => {
      setTextMetadata(games[index], "release_date", releaseDate.value);
      updateSaveState();
    });

    const releaseYear = document.createElement("input");
    releaseYear.type = "number";
    releaseYear.min = "1900";
    releaseYear.max = "2100";
    releaseYear.step = "1";
    releaseYear.value = game.release_year ?? "";
    releaseYear.setAttribute("aria-label", `Release year for ${game.title}`);
    releaseYear.addEventListener("input", () => {
      setNumberMetadata(games[index], "release_year", releaseYear.value);
      updateSaveState();
    });

    const favorite = document.createElement("input");
    favorite.type = "checkbox";
    favorite.checked = Boolean(game.favorite);
    favorite.setAttribute("aria-label", `Mark ${game.title} as a favorite`);
    favorite.addEventListener("change", () => {
      if (favorite.checked) games[index].favorite = true;
      else delete games[index].favorite;
      updateSaveState();
    });

    const favoriteLabel = document.createElement("label");
    favoriteLabel.className = "toggle-field";
    favoriteLabel.append(favorite, document.createTextNode("Favorite"));

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
    starLabel.className = "toggle-field";
    starLabel.append(starred, document.createTextNode("Hall of Fame"));

    const knownKeys = new Set([
      "title", "comment", "starred", "favorite", "play_year", "played_year",
      "platform", "platforms", "started_on", "beaten_on", "play_time",
      "release_date", "release_year",
    ]);
    const extraMetadata = {};
    Object.entries(game).forEach(([key, value]) => {
      if (!knownKeys.has(key)) extraMetadata[key] = value;
    });

    const metadata = document.createElement("textarea");
    metadata.className = "metadata-json";
    metadata.value = JSON.stringify(extraMetadata, null, 2);
    metadata.setAttribute("aria-label", `Additional metadata for ${game.title}`);
    metadata.placeholder = "{}";
    metadata.addEventListener("input", () => {
      try {
        const parsed = JSON.parse(metadata.value);
        if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
        Object.keys(game).forEach((key) => {
          if (!knownKeys.has(key)) delete game[key];
        });
        Object.assign(game, parsed);
        metadata.setCustomValidity("");
      } catch {
        metadata.setCustomValidity("Additional metadata must be a JSON object.");
      }
      updateSaveState();
    });
    metadata.addEventListener("blur", () => {
      if (metadata.validity.valid) {
        metadata.value = JSON.stringify(
          Object.fromEntries(Object.entries(game).filter(([key]) => !knownKeys.has(key))),
          null,
          2,
        );
      }
    });

    row.dataset.title = game.title.toLocaleLowerCase();
    row.append(
      makeField("Game title", title),
      makeField("Comment", comment),
      makeField("Played", playedYear),
      makeField("Platform", platform),
      makeField("Platforms (comma-separated)", platforms),
      makeField("Started", startedOn),
      makeField("Beaten", beatenOn),
      makeField("Play time", playTime),
      makeField("Release date", releaseDate),
      makeField("Release year", releaseYear),
      favoriteLabel,
      starLabel,
      makeField("Additional metadata (JSON)", metadata),
    );
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

  games.push({ title, play_year: new Date().getFullYear() });
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
  const invalidMetadata = gamesContainer.querySelector(
    ".metadata-json:invalid",
  );
  if (invalidMetadata) {
    invalidMetadata.reportValidity();
    setStatus("Fix the additional metadata JSON before saving.", true);
    return;
  }
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
