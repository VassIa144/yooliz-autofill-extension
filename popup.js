const statusElement = document.getElementById("status");
const quotesListElement = document.getElementById("quotes-list");
const clearFilledButton = document.getElementById("clear-filled");
const storage = chrome?.storage?.local;
const filledQuotes = new Set();
const hiddenFilledQuotes = new Set();
let currentQuotes = [];
let refreshIntervalId = null;
let isAutoRefreshing = false;

const REFRESH_INTERVAL_MS = 5000;

const STORAGE_KEYS = {
  filledQuotes: "yoolizFilledQuotes",
  hiddenFilledQuotes: "yoolizHiddenFilledQuotes",
};

const STATUS_CLASSES = ["popup__status--loading", "popup__status--error", "popup__status--success"];

const setStatus = (message = "", type = "info") => {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  STATUS_CLASSES.forEach((className) => statusElement.classList.remove(className));

  if (type === "loading") {
    statusElement.classList.add("popup__status--loading");
  } else if (type === "error") {
    statusElement.classList.add("popup__status--error");
  } else if (type === "success") {
    statusElement.classList.add("popup__status--success");
  }
};

const log = (message, extra) => {
  if (extra !== undefined) {
    console.log(`[Popup] ${message}`, extra);
  } else {
    console.log(`[Popup] ${message}`);
  }
};

const sendRuntimeMessage = (message) =>
  new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });

const getQuoteKey = (quote) => {
  if (quote?.id) {
    return `id:${quote.id}`;
  }

  if (quote?.label) {
    return `label:${quote.label}`;
  }

  return JSON.stringify(quote ?? {});
};

const persistPopupState = () => {
  if (!storage) {
    return;
  }

  try {
    storage.set(
      {
        [STORAGE_KEYS.filledQuotes]: Array.from(filledQuotes),
        [STORAGE_KEYS.hiddenFilledQuotes]: Array.from(hiddenFilledQuotes),
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn("[Popup] Impossible d'enregistrer l'état", chrome.runtime.lastError);
        }
      }
    );
  } catch (error) {
    console.warn("[Popup] Échec de la persistance de l'état", error);
  }
};

const restorePopupState = () =>
  new Promise((resolve) => {
    if (!storage) {
      resolve();
      return;
    }

    try {
      storage.get(
        [STORAGE_KEYS.filledQuotes, STORAGE_KEYS.hiddenFilledQuotes],
        (result) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "[Popup] Impossible de restaurer l'état précédent",
              chrome.runtime.lastError
            );
            resolve();
            return;
          }

          const storedFilled = result?.[STORAGE_KEYS.filledQuotes];
          const storedHidden = result?.[STORAGE_KEYS.hiddenFilledQuotes];

          if (Array.isArray(storedFilled)) {
            storedFilled.forEach((key) => filledQuotes.add(key));
          }

          if (Array.isArray(storedHidden)) {
            storedHidden.forEach((key) => hiddenFilledQuotes.add(key));
          }

          updateClearFilledVisibility();
          renderQuotes();
          resolve();
        }
      );
    } catch (error) {
      console.warn("[Popup] Échec de la restauration de l'état", error);
      resolve();
    }
  });

const countFilledQuotesInView = () =>
  currentQuotes.reduce((count, quote) => {
    const key = getQuoteKey(quote);
    if (hiddenFilledQuotes.has(key)) {
      return count;
    }

    return filledQuotes.has(key) ? count + 1 : count;
  }, 0);

const pruneStateForCurrentQuotes = () => {
  const validKeys = new Set(currentQuotes.map((quote) => getQuoteKey(quote)));
  let stateChanged = false;

  for (const key of Array.from(filledQuotes)) {
    if (!validKeys.has(key)) {
      filledQuotes.delete(key);
      stateChanged = true;
    }
  }

  for (const key of Array.from(hiddenFilledQuotes)) {
    if (!validKeys.has(key)) {
      hiddenFilledQuotes.delete(key);
      stateChanged = true;
    }
  }

  if (stateChanged) {
    persistPopupState();
  }
};

const buildQuoteSignature = (quote = {}) =>
  [
    getQuoteKey(quote),
    quote.rowNumber ?? "",
    quote.make ?? "",
    quote.model ?? "",
    quote.engine ?? "",
    quote.fuelType ?? "",
    quote.usageType ?? "",
    quote.vehicleType ?? "",
    quote.vehicleCategory ?? "",
  ].join("|");

const haveQuotesChanged = (nextQuotes = []) => {
  if (!Array.isArray(nextQuotes)) {
    return false;
  }

  if (currentQuotes.length !== nextQuotes.length) {
    return true;
  }

  const currentSignatures = currentQuotes.map((quote) => buildQuoteSignature(quote)).sort();
  const nextSignatures = nextQuotes.map((quote) => buildQuoteSignature(quote)).sort();

  for (let index = 0; index < currentSignatures.length; index += 1) {
    if (currentSignatures[index] !== nextSignatures[index]) {
      return true;
    }
  }

  return false;
};

const updateClearFilledVisibility = () => {
  if (!clearFilledButton) {
    return;
  }

  const filledCount = countFilledQuotesInView();
  const hasFilledQuotes = filledCount > 0;
  clearFilledButton.hidden = !hasFilledQuotes;
  clearFilledButton.disabled = !hasFilledQuotes;

  if (!hasFilledQuotes) {
    clearFilledButton.textContent = "Supprimer les devis utilisés";
    return;
  }

  clearFilledButton.textContent =
    filledCount === 1
      ? "Supprimer le devis utilisé"
      : `Supprimer ${filledCount} devis utilisés`;
};

const sendFillRequest = async (quote) => {
  const payload = {
    make: quote.make || "",
    model: quote.model || "",
    engine: quote.engine || "",
    fuelType: quote.fuelType || "",
    usageType: quote.usageType || "",
    vehicleType: quote.vehicleType || "",
    vehicleCategory: quote.vehicleCategory || "",
  };

  try {
    const response = await sendRuntimeMessage({
      action: "fillQuote",
      data: payload,
      quoteId: quote.id,
    });

    if (!response?.success) {
      throw new Error(response?.error || "Réponse invalide du service");
    }

    log("Requête de remplissage envoyée", payload);
    setStatus(`Devis « ${quote.label} » envoyé.`, "success");
    return true;
  } catch (error) {
    console.error("[Popup] Erreur lors de l'envoi de la requête", error);
    if (
      error?.message === "Impossible de sélectionner le carburant." ||
      error?.message === "Impossible de sélectionner l'usage."
    ) {
      log(
        "Le remplissage s'est terminé malgré un échec de sélection de carburant ou d'usage."
      );
      setStatus(`Devis « ${quote.label} » envoyé.`, "success");
      return true;
    }

    const message = error?.message
      ? `Erreur lors de l'envoi : ${error.message}`
      : "Impossible d'envoyer le devis au formulaire.";
    setStatus(message, "error");
    return false;
  }
};

const createQuoteElement = (quote) => {
  const item = document.createElement("li");
  item.className = "popup__list-item";

  const header = document.createElement("div");
  header.className = "popup__list-header";

  const title = document.createElement("p");
  title.className = "popup__list-title";
  title.textContent = quote.label;

  const progress = document.createElement("span");
  progress.className = "popup__list-progress";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-hidden", "true");

  header.appendChild(title);
  header.appendChild(progress);

  const meta = document.createElement("p");
  meta.className = "popup__list-meta";
  const metaParts = [quote.make, quote.model, quote.engine].filter(Boolean);
  meta.textContent = metaParts.length > 0 ? metaParts.join(" • ") : "Informations véhicule indisponibles";

  const secondaryMetaParts = [quote.vehicleType, quote.vehicleCategory].filter(Boolean);
  const secondaryMeta = document.createElement("p");
  secondaryMeta.className = "popup__list-meta popup__list-meta--secondary";
  secondaryMeta.textContent =
    secondaryMetaParts.length > 0 ? secondaryMetaParts.join(" • ") : "";

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "popup__list-action";
  actionButton.textContent = "Remplir";
  let isSending = false;
  const quoteKey = getQuoteKey(quote);
  let isFilled = filledQuotes.has(quoteKey);

  const filledIndicator = document.createElement("span");
  filledIndicator.className = "popup__list-filled-indicator";
  filledIndicator.textContent = "UTILISÉ";
  filledIndicator.setAttribute("aria-hidden", "true");

  const actionsRow = document.createElement("div");
  actionsRow.className = "popup__list-actions";
  actionsRow.appendChild(actionButton);
  actionsRow.appendChild(filledIndicator);

  const setLoadingState = (isLoading) => {
    isSending = isLoading;
    actionButton.disabled = isLoading || isFilled;
    item.classList.toggle("popup__list-item--loading", isLoading);
    if (isLoading) {
      progress.classList.add("popup__list-progress--visible");
      progress.setAttribute("aria-hidden", "false");
      progress.setAttribute("aria-label", `Envoi du devis « ${quote.label} »`);
    } else {
      progress.classList.remove("popup__list-progress--visible");
      progress.setAttribute("aria-hidden", "true");
      progress.removeAttribute("aria-label");
    }
  };

  const setFilledState = (filled) => {
    isFilled = Boolean(filled);
    item.classList.toggle("popup__list-item--filled", isFilled);
    if (isFilled) {
      actionButton.classList.add("popup__list-action--filled");
      filledQuotes.add(quoteKey);
      hiddenFilledQuotes.delete(quoteKey);
      filledIndicator.classList.add("popup__list-filled-indicator--visible");
      filledIndicator.setAttribute("aria-hidden", "false");
    } else {
      actionButton.classList.remove("popup__list-action--filled");
      filledQuotes.delete(quoteKey);
      filledIndicator.classList.remove("popup__list-filled-indicator--visible");
      filledIndicator.setAttribute("aria-hidden", "true");
    }
    actionButton.textContent = "Remplir";
    actionButton.disabled = isFilled || isSending;
    persistPopupState();
    updateClearFilledVisibility();
  };

  if (isFilled) {
    setFilledState(true);
  }

  actionButton.addEventListener("click", async () => {
    if (isSending) {
      return;
    }

    log("Devis sélectionné", quote);
    setStatus(`Envoi du devis « ${quote.label} »…`, "loading");
    setLoadingState(true);

    try {
      const success = await sendFillRequest(quote);
      if (success) {
        setFilledState(true);
      }
    } finally {
      setLoadingState(false);
    }
  });

  item.appendChild(header);
  item.appendChild(meta);
  if (secondaryMetaParts.length > 0) {
    item.appendChild(secondaryMeta);
  }
  item.appendChild(actionsRow);

  return item;
};

const renderQuotes = () => {
  if (!quotesListElement) {
    return;
  }

  quotesListElement.replaceChildren();

  currentQuotes
    .filter((quote) => !hiddenFilledQuotes.has(getQuoteKey(quote)))
    .forEach((quote) => {
      quotesListElement.appendChild(createQuoteElement(quote));
    });

  updateClearFilledVisibility();
};

const setQuotes = (quotes = []) => {
  currentQuotes = Array.isArray(quotes) ? [...quotes] : [];
  pruneStateForCurrentQuotes();
  renderQuotes();
};

const notifyRemovedQuotes = async (quotes) => {
  if (!Array.isArray(quotes) || quotes.length === 0) {
    return { success: true, removed: 0 };
  }

  const response = await sendRuntimeMessage({
    action: "removeUsedQuotes",
    quotes,
  });

  if (!response?.success) {
    throw new Error(response?.error || "Le service de suppression a échoué.");
  }

  return response;
};

const loadQuotes = async ({
  forceRefresh = false,
  silent = false,
  suppressStatusUpdate = false,
} = {}) => {
  if (!silent) {
    setStatus("Chargement des devis…", "loading");
  }

  try {
    const response = await sendRuntimeMessage({
      action: "getQuotes",
      forceRefresh,
    });

    if (!response?.success) {
      throw new Error(response?.error || "Réponse invalide du service");
    }

    const quotes = Array.isArray(response.quotes) ? response.quotes : [];

    if (quotes.length === 0) {
      setQuotes([]);
      if (!suppressStatusUpdate) {
        setStatus("Aucun devis disponible.");
      }
      return quotes;
    }

    const quotesChanged = haveQuotesChanged(quotes);
    setQuotes(quotes);

    if (!silent) {
      const statusMessage = response.fromCache
        ? "Devis chargés (cache)."
        : "Devis chargés depuis Google Sheets.";

      setStatus(statusMessage, "success");
    } else if (quotesChanged && !suppressStatusUpdate) {
      setStatus("Liste des devis mise à jour.", "success");
    }

    return quotes;
  } catch (error) {
    console.error("[Popup] Échec du chargement des devis", error);
    setStatus("Erreur lors de la récupération des devis.", "error");
    return [];
  }
};

const initializePopup = async () => {
  await restorePopupState();
  await loadQuotes({ forceRefresh: true });
  if (refreshIntervalId !== null) {
    clearInterval(refreshIntervalId);
  }
  refreshIntervalId = setInterval(() => {
    if (isAutoRefreshing) {
      return;
    }

    isAutoRefreshing = true;
    loadQuotes({ forceRefresh: true, silent: true }).finally(() => {
      isAutoRefreshing = false;
    });
  }, REFRESH_INTERVAL_MS);
};

initializePopup();

window.addEventListener("unload", () => {
  if (refreshIntervalId !== null) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
});

if (clearFilledButton) {
  clearFilledButton.addEventListener("click", async () => {
    const filledCount = countFilledQuotesInView();

    if (filledCount === 0) {
      setStatus("Aucun devis rempli à retirer.");
      return;
    }

    const filledQuotesInView = currentQuotes.filter((quote) =>
      filledQuotes.has(getQuoteKey(quote))
    );

    const filledKeysToHide = filledQuotesInView.map((quote) => getQuoteKey(quote));

    const previousHidden = new Set(hiddenFilledQuotes);

    filledKeysToHide.forEach((key) => hiddenFilledQuotes.add(key));

    renderQuotes();
    persistPopupState();

    const removalPayload = filledQuotesInView.map((quote) => ({
      key: getQuoteKey(quote),
      id: quote.id || "",
      label: quote.label || "",
      rowNumber: typeof quote.rowNumber === "number" ? quote.rowNumber : null,
      raw: quote.raw || null,
    }));

    setStatus("Suppression des devis utilisés…", "loading");

    try {
      await notifyRemovedQuotes(removalPayload);
      await loadQuotes({ forceRefresh: true, silent: true, suppressStatusUpdate: true });
      const message =
        filledCount === 1
          ? "Le devis utilisé a été retiré de la liste."
          : `${filledCount} devis utilisés ont été retirés de la liste.`;
      setStatus(message, "success");
    } catch (error) {
      console.error("[Popup] Échec de la notification de suppression", error);
      hiddenFilledQuotes.clear();
      previousHidden.forEach((key) => hiddenFilledQuotes.add(key));
      renderQuotes();
      persistPopupState();
      setStatus(
        error?.message
          ? `Erreur lors de la suppression des devis utilisés : ${error.message}`
          : "Impossible de notifier la suppression des devis utilisés.",
        "error"
      );
    }
  });
}
