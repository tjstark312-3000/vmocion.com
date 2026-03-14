const WAITLIST_ENDPOINT = "/api/waitlist";
const WAITLIST_STATUS_ENDPOINT = "/api/waitlist-status";
const CHECKOUT_STATUS_ENDPOINT = "/api/checkout-status";

const WAITLIST_OPTIONS = {
  priority_10000: {
    amount: 100,
    buttonText: "Continue to Stripe"
  },
  priority_100000: {
    amount: 75,
    buttonText: "Continue to Stripe"
  },
  priority_1000000: {
    amount: 50,
    buttonText: "Continue to Stripe"
  },
  free: {
    amount: 0,
    buttonText: "Join Free Waitlist"
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("waitlistForm");
  if (!form) return;

  const nameInput = document.getElementById("nameInput");
  const emailInput = document.getElementById("emailInput");
  const companyInput = document.getElementById("companyInput");
  const submitButton = document.getElementById("submitButton");
  const statusMessage = document.getElementById("statusMessage");
  const formPanel = document.getElementById("formPanel");
  const successPanel = document.getElementById("successPanel");
  const resetButton = document.getElementById("resetButton");
  const optionInputs = Array.from(form.querySelectorAll('input[name="waitlistTier"]'));
  const urlParams = new URLSearchParams(window.location.search);
  const tierOptions = Array.from(document.querySelectorAll("[data-tier-option]"));
  const soldOutTierIds = new Set();

  function clearFieldState(event) {
    event.target.classList.remove("is-invalid");
  }

  function getSelectedTier() {
    const checked = form.querySelector('input[name="waitlistTier"]:checked');
    return checked ? checked.value : "";
  }

  function setStatus(type, message) {
    statusMessage.textContent = message;
    statusMessage.className = "status-message is-visible";
    if (type) {
      statusMessage.classList.add(type);
    }
  }

  function clearStatus() {
    statusMessage.textContent = "";
    statusMessage.className = "status-message";
  }

  function updateSubmitCopy() {
    const selectedTier = getSelectedTier();
    const buttonText = WAITLIST_OPTIONS[selectedTier]
      ? WAITLIST_OPTIONS[selectedTier].buttonText
      : "Choose Your Reservation";

    submitButton.textContent = buttonText;
    submitButton.setAttribute("data-selected-tier", selectedTier || "none");
  }

  function setTierAvailability(tierId, info) {
    const option = document.querySelector(`[data-tier-option="${tierId}"]`);
    const label = document.querySelector(`[data-tier-availability="${tierId}"]`);
    if (!option || !label) return;

    const input = option.querySelector('input[name="waitlistTier"]');
    if (!input) return;

    const isFree = tierId === "free";
    const soldOut = Boolean(info && info.soldOut);
    const remaining = info && typeof info.remaining === "number" ? info.remaining : null;

    option.classList.toggle("is-sold-out", soldOut);
    input.disabled = soldOut;

    if (soldOut) {
      soldOutTierIds.add(tierId);
      if (input.checked) {
        input.checked = false;
      }
      label.textContent = "Sold out";
      updateSubmitCopy();
      return;
    }

    soldOutTierIds.delete(tierId);
    if (isFree) {
      label.textContent = "Always available";
      return;
    }

    if (typeof remaining === "number") {
      label.textContent = remaining > 0 ? `${remaining.toLocaleString()} spots remaining` : "Sold out";
      return;
    }

    label.textContent = "Available";
  }

  async function loadAvailability() {
    try {
      const response = await fetch(WAITLIST_STATUS_ENDPOINT, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        },
        credentials: "same-origin"
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.status !== "ok" || !payload.tiers) {
        throw new Error("Unable to load live availability.");
      }

      Object.entries(payload.tiers).forEach(([tierId, info]) => {
        setTierAvailability(tierId, info);
      });
    } catch (error) {
      tierOptions.forEach((option) => {
        const tierId = option.getAttribute("data-tier-option");
        const label = tierId ? document.querySelector(`[data-tier-availability="${tierId}"]`) : null;
        if (label && tierId !== "free") {
          label.textContent = "Availability unavailable";
        }
      });
    }
  }

  async function verifyCheckout(sessionId) {
    try {
      const response = await fetch(`${CHECKOUT_STATUS_ENDPOINT}?session_id=${encodeURIComponent(sessionId)}`, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        },
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload.status !== "ok") {
        throw new Error(payload.message || "Unable to verify payment status.");
      }

      if (payload.checkoutStatus === "paid") {
        setStatus("is-success", "Stripe checkout completed. Your priority reservation is confirmed.");
        return;
      }

      setStatus("is-info", "Stripe checkout completed. Your reservation is still being finalized.");
    } catch (error) {
      setStatus("is-info", "Stripe checkout completed. Payment verification is still in progress.");
    }
  }

  function setLoadingState(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.classList.toggle("loading", isLoading);
    if (isLoading) {
      submitButton.textContent = "Securing Your Spot...";
      return;
    }

    updateSubmitCopy();
  }

  function showValidationState(selectedTier) {
    let isValid = true;

    if (!nameInput.value.trim()) {
      nameInput.classList.add("is-invalid");
      isValid = false;
    }

    if (!emailInput.validity.valid || !emailInput.value.trim()) {
      emailInput.classList.add("is-invalid");
      isValid = false;
    }

    if (!selectedTier) {
      isValid = false;
      setStatus("is-error", "Choose a priority reservation tier or the free waitlist before continuing.");
    }

    return isValid;
  }

  async function submitForm(event) {
    event.preventDefault();
    clearStatus();

    const selectedTier = getSelectedTier();
    const isValid = showValidationState(selectedTier);

    if (!isValid) {
      if (!selectedTier) {
        return;
      }

      form.reportValidity();
      return;
    }

    setLoadingState(true);

    try {
      const response = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          tier: selectedTier,
          company: companyInput.value.trim()
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload.status !== "ok") {
        if (payload.code === "tier_sold_out" && payload.availability && payload.availability.selectionId) {
          setTierAvailability(payload.availability.selectionId, payload.availability);
          await loadAvailability();
        }
        throw new Error(payload.message || "Unable to save your reservation right now.");
      }

      if (payload.mode === "paid" && payload.redirectUrl) {
        setStatus("is-info", "Reservation saved. Redirecting to Stripe checkout...");
        window.location.assign(payload.redirectUrl);
        return;
      }

      form.reset();
      updateSubmitCopy();
      formPanel.hidden = true;
      successPanel.hidden = false;
      successPanel.classList.add("is-visible");
      setStatus("is-success", "You have been added to the VFORCE waitlist.");
    } catch (error) {
      setStatus("is-error", error.message);
    } finally {
      setLoadingState(false);
    }
  }

  function resetView() {
    form.reset();
    clearStatus();
    updateSubmitCopy();
    formPanel.hidden = false;
    successPanel.hidden = true;
    successPanel.classList.remove("is-visible");
    nameInput.focus();
  }

  nameInput.addEventListener("input", clearFieldState);
  emailInput.addEventListener("input", clearFieldState);
  form.addEventListener("submit", submitForm);
  resetButton.addEventListener("click", resetView);
  optionInputs.forEach((input) => {
    input.addEventListener("change", () => {
      clearStatus();
      updateSubmitCopy();
    });
  });

  if (urlParams.get("checkout") === "success") {
    const sessionId = urlParams.get("session_id");
    setStatus("is-info", "Stripe checkout completed. We are confirming your priority reservation now.");
    if (sessionId) {
      verifyCheckout(sessionId);
    }
  }

  if (urlParams.get("checkout") === "cancelled") {
    setStatus("is-info", "Stripe checkout was cancelled. Your details are saved, and you can return to checkout any time.");
  }

  updateSubmitCopy();
  loadAvailability();
});
