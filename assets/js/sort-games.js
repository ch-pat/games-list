const normalize = (value) => value
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLocaleLowerCase()
  .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
  .trim();

function editDistance(left, right) {
  const rows = [Array.from({ length: right.length + 1 }, (_, index) => index)];

  for (let i = 1; i <= left.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= right.length; j += 1) {
      row[j] = Math.min(
        row[j - 1] + 1,
        rows[i - 1][j] + 1,
        rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        row[j] = Math.min(row[j], rows[i - 2][j - 2] + 1);
      }
    }
    rows.push(row);
  }

  return rows[left.length][right.length];
}

function tokenMatches(query, titleToken) {
  if (titleToken.includes(query)) return true;

  const maxDistance = query.length >= 8 ? 2 : query.length >= 4 ? 1 : 0;
  if (!maxDistance) return false;

  const minLength = Math.max(1, query.length - maxDistance);
  const maxLength = Math.min(titleToken.length, query.length + maxDistance);
  for (let length = minLength; length <= maxLength; length += 1) {
    for (let start = 0; start <= titleToken.length - length; start += 1) {
      if (editDistance(query, titleToken.slice(start, start + length)) <= maxDistance) {
        return true;
      }
    }
  }
  return false;
}

function fuzzyTitleMatch(query, title) {
  const normalizedQuery = normalize(query);
  const normalizedTitle = normalize(title);
  if (!normalizedQuery) return true;
  if (normalizedTitle.includes(normalizedQuery)) return true;

  const titleTokens = normalizedTitle.split(" ");
  return normalizedQuery.split(" ").every((queryToken) =>
    titleTokens.some((titleToken) => tokenMatches(queryToken, titleToken)),
  );
}

document.querySelectorAll(".catalogue").forEach((catalogue) => {
  const list = catalogue.querySelector(".game-list");
  if (!list) return;
  const filter = catalogue.querySelector("[data-filter-control]");
  const sort = catalogue.querySelector("[data-sort-control]");
  const count = catalogue.querySelector("[data-result-count]");
  const emptyState = catalogue.querySelector("[data-empty-state]");
  const cards = Array.from(list.querySelectorAll("[data-game-card]"));

  const updateFilter = () => {
    const query = filter?.value ?? "";
    let visibleCount = 0;
    cards.forEach((card) => {
      const visible = fuzzyTitleMatch(query, card.dataset.title);
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    if (count) count.textContent = `${visibleCount} ${visibleCount === 1 ? "game" : "games"}`;
    if (emptyState) emptyState.hidden = visibleCount > 0;
  };

  filter?.addEventListener("input", updateFilter);
  sort?.addEventListener("change", () => {
    const key = sort.value;
    cards.sort((left, right) => {
      if (key === "title") {
        return left.dataset.title.localeCompare(right.dataset.title);
      }

      const field = key === "release-date" ? "releaseDate" : "playYear";
      const leftValue = left.dataset[field];
      const rightValue = right.dataset[field];
      const leftMissing = !leftValue;
      const rightMissing = !rightValue;

      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
      if (leftMissing) return left.dataset.title.localeCompare(right.dataset.title);
      return leftValue.localeCompare(rightValue, undefined, { numeric: true }) ||
        left.dataset.title.localeCompare(right.dataset.title);
    });

    list.replaceChildren(...cards);
  });
});
