document.querySelectorAll("[data-sort-control]").forEach((control) => {
  const list = control.closest(".catalogue").querySelector(".game-list");
  if (!list) return;

  control.addEventListener("change", () => {
    const cards = Array.from(list.querySelectorAll("[data-game-card]"));
    const key = control.value;

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
