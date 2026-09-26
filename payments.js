(function () {
  "use strict";

  const MONTHLY_AMOUNTS = Object.freeze({ basico: 400, creador: 800, pro: 2400 });
  const originalLinks = new WeakMap();
  const guardedLinks = new WeakSet();

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function officialUrl(value, provider, kind) {
    if (provider !== "stripe" || typeof value !== "string" || !value.trim()) return "";
    let url;
    try {
      url = new URL(value.trim());
    } catch (_) {
      return "";
    }
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return "";
    const checkout = kind === "checkout" && url.hostname === "buy.stripe.com" && /^\/[A-Za-z0-9]{8,200}$/.test(url.pathname);
    const portal = kind === "portal" && url.hostname === "billing.stripe.com" && /^\/p\/login\/[A-Za-z0-9]{8,200}$/.test(url.pathname);
    return checkout || portal ? url.href : "";
  }

  // This validates public configuration, never a customer's payment or access.
  function validateConfig(config) {
    const result = { ready: false, portalReady: false, checkoutUrls: {}, portalUrl: "", reasons: [] };
    if (!isRecord(config)) {
      result.reasons.push("missing-config");
      return result;
    }
    if (config.provider !== "stripe") result.reasons.push("unsupported-provider");
    if (config.mode !== "live") result.reasons.push("not-live");
    if (config.serviceReady !== true) result.reasons.push("service-not-ready");
    if (config.currency !== "USD" || config.interval !== "month") result.reasons.push("invalid-billing-period-or-currency");

    result.portalUrl = officialUrl(config.portalUrl, config.provider, "portal");
    result.portalReady = config.mode === "live" && Boolean(result.portalUrl);
    if (!result.portalUrl) result.reasons.push("missing-or-invalid-portal");

    const planConfig = isRecord(config.plans) ? config.plans : {};
    for (const [name, expectedAmount] of Object.entries(MONTHLY_AMOUNTS)) {
      const plan = isRecord(planConfig[name]) ? planConfig[name] : {};
      const checkoutUrl = officialUrl(plan.checkoutUrl, config.provider, "checkout");
      if (plan.amountCents !== expectedAmount || !checkoutUrl) result.reasons.push("invalid-plan-" + name);
      result.checkoutUrls[name] = checkoutUrl;
    }
    const urls = Object.values(result.checkoutUrls);
    if (urls.every(Boolean) && new Set(urls).size !== urls.length) result.reasons.push("duplicate-checkout-links");
    result.ready = result.reasons.length === 0;
    return result;
  }

  function rememberLink(anchor) {
    if (!originalLinks.has(anchor)) {
      const href = anchor.getAttribute("href") || "";
      originalLinks.set(anchor, {
        // Preserve only email inquiries or this site's real inquiry form.
        inquiryHref: /^mailto:/i.test(href.trim()) || (href === "#solicitar-plan" && document.getElementById("solicitar-plan")) ? href : "",
        text: anchor.textContent
      });
    }
    if (!guardedLinks.has(anchor)) {
      anchor.addEventListener("click", function (event) {
        if (anchor.getAttribute("aria-disabled") === "true") event.preventDefault();
      });
      guardedLinks.add(anchor);
    }
    return originalLinks.get(anchor);
  }

  function refresh() {
    const state = validateConfig(window.HACKGORITHMIC_PAYMENTS);
    document.querySelectorAll("a[data-subscription-plan]").forEach(function (anchor) {
      const original = rememberLink(anchor);
      const plan = anchor.getAttribute("data-subscription-plan");
      if (state.ready && Object.prototype.hasOwnProperty.call(MONTHLY_AMOUNTS, plan)) {
        anchor.setAttribute("href", state.checkoutUrls[plan]);
        anchor.removeAttribute("aria-disabled");
        anchor.setAttribute("data-payment-state", "checkout-available");
        anchor.textContent = "Suscribirme — $" + MONTHLY_AMOUNTS[plan] / 100 + "/mes";
      } else {
        anchor.textContent = original.text;
        anchor.setAttribute("data-payment-state", "pending");
        if (original.inquiryHref) {
          anchor.setAttribute("href", original.inquiryHref);
          anchor.removeAttribute("aria-disabled");
        } else {
          anchor.removeAttribute("href");
          anchor.setAttribute("aria-disabled", "true");
        }
      }
    });

    document.querySelectorAll("[data-subscription-portal]").forEach(function (anchor) {
      anchor.hidden = !state.portalReady;
      if (state.portalReady) {
        anchor.setAttribute("href", state.portalUrl);
        anchor.removeAttribute("aria-disabled");
      } else {
        anchor.removeAttribute("href");
        anchor.setAttribute("aria-disabled", "true");
      }
    });
    document.querySelectorAll("[data-subscription-pending]").forEach(function (element) { element.hidden = state.ready; });
    document.querySelectorAll("[data-subscription-live]").forEach(function (element) { element.hidden = !state.ready; });
    // Annual billing has no configured products or links in this integration.
    document.querySelectorAll("[data-subscription-annual]").forEach(function (element) { element.hidden = true; });
    return state;
  }

  window.HackgorithmicPayments = Object.freeze({ refresh: refresh, validateConfig: validateConfig });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  } else {
    refresh();
  }
})();
