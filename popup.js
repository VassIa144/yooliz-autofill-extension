const statusElement = document.getElementById("status");
const quotesListElement = document.getElementById("quotes-list");
const clearFilledButton = document.getElementById("clear-filled");
const filledQuotes = new Set();
let currentQuotes = [];

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

const countFilledQuotesInView = () =>
  currentQuotes.reduce(
    (count, quote) => (filledQuotes.has(getQuoteKey(quote)) ? count + 1 : count),
    0
  );

const updateClearFilledVisibility = () => {
  if (!clearFilledButton) {
    return;
  }

  const filledCount = countFilledQuotesInView();
  const hasFilledQuotes = filledCount > 0;
  clearFilledButton.hidden = !hasFilledQuotes;
  clearFilledButton.disabled = !hasFilledQuotes;

  if (!hasFilledQuotes) {
    clearFilledButton.textContent = "Supprimer les devis remplis";
    return;
  }

  clearFilledButton.textContent =
    filledCount === 1
      ? "Supprimer le devis rempli"
      : `Supprimer ${filledCount} devis remplis`;
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
    if (error?.message === "Impossible de sélectionner le carburant.") {
      log("Le remplissage s'est terminé malgré l'échec de sélection du carburant.");
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
  filledIndicator.textContent = "REMPLI";
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

  currentQuotes.forEach((quote) => {
    quotesListElement.appendChild(createQuoteElement(quote));
  });

  updateClearFilledVisibility();
};

const setQuotes = (quotes = []) => {
  currentQuotes = Array.isArray(quotes) ? [...quotes] : [];
  renderQuotes();
};

const loadQuotes = async () => {
  setStatus("Chargement des devis…", "loading");

  try {
    const response = await sendRuntimeMessage({ action: "getQuotes" });

    if (!response?.success) {
      throw new Error(response?.error || "Réponse invalide du service");
    }

    const quotes = Array.isArray(response.quotes) ? response.quotes : [];

    if (quotes.length === 0) {
      setQuotes([]);
      setStatus("Aucun devis disponible.");
      return;
    }

    setQuotes(quotes);

    const statusMessage = response.fromCache
      ? "Devis chargés (cache)."
      : "Devis chargés depuis Google Sheets.";

    setStatus(statusMessage, "success");
  } catch (error) {
    console.error("[Popup] Échec du chargement des devis", error);
    setStatus("Erreur lors de la récupération des devis.", "error");
  }
};

loadQuotes();

if (clearFilledButton) {
  clearFilledButton.addEventListener("click", () => {
    const filledCount = countFilledQuotesInView();

    if (filledCount === 0) {
      setStatus("Aucun devis rempli à retirer.");
      return;
    }

    const previousLength = currentQuotes.length;
    currentQuotes = currentQuotes.filter((quote) => !filledQuotes.has(getQuoteKey(quote)));
    renderQuotes();

    if (currentQuotes.length < previousLength) {
      const message =
        filledCount === 1
          ? "Le devis rempli a été retiré de la liste."
          : `${filledCount} devis remplis ont été retirés de la liste.`;
      setStatus(message, "success");
    } else {
      setStatus("Aucun devis rempli à retirer.");
    }
  });
}
