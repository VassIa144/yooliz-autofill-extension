const statusElement = document.getElementById("status");
const quotesListElement = document.getElementById("quotes-list");

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

  const setLoadingState = (isLoading) => {
    isSending = isLoading;
    actionButton.disabled = isLoading;
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

  actionButton.addEventListener("click", async () => {
    if (isSending) {
      return;
    }

    log("Devis sélectionné", quote);
    setStatus(`Envoi du devis « ${quote.label} »…`, "loading");
    setLoadingState(true);

    try {
      await sendFillRequest(quote);
    } finally {
      setLoadingState(false);
    }
  });

  item.appendChild(header);
  item.appendChild(meta);
  if (secondaryMetaParts.length > 0) {
    item.appendChild(secondaryMeta);
  }
  item.appendChild(actionButton);

  return item;
};

const renderQuotes = (quotes = []) => {
  if (!quotesListElement) {
    return;
  }

  quotesListElement.replaceChildren();

  quotes.forEach((quote) => {
    quotesListElement.appendChild(createQuoteElement(quote));
  });
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
      renderQuotes([]);
      setStatus("Aucun devis disponible.");
      return;
    }

    renderQuotes(quotes);

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
