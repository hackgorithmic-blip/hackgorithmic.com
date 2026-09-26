/* Public configuration only. Never put API keys or customer data in this file.
 * Keep mode pending until the real account and all three checkouts are verified.
 * Set serviceReady only when the published plan benefits can be delivered.
 * See entrega/PAGOS_PENDIENTES.md for the integration contract.
 */
window.HACKGORITHMIC_PAYMENTS = {
  provider: "",
  mode: "pending",
  serviceReady: false,
  currency: "USD",
  interval: "month",
  plans: {
    basico: { amountCents: 400, checkoutUrl: "" },
    creador: { amountCents: 800, checkoutUrl: "" },
    pro: { amountCents: 2400, checkoutUrl: "" }
  },
  portalUrl: ""
};
