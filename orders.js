(function () {
  "use strict";

  const CONTACT = "hackgorithmic@gmail.com";
  const COPY_TO = "agent@hackgorithmic.com";
  const PLANS = Object.freeze({
    basico: "Básico — $4 USD al mes",
    creador: "Creador — $8 USD al mes",
    pro: "Pro — $24 USD al mes"
  });
  const byId = function (id) { return document.getElementById(id); };
  const planForm = byId("plan-request");
  const orderForm = byId("ord");

  function mailto(subject, body) {
    return "mailto:" + CONTACT + "?cc=" + encodeURIComponent(COPY_TO) + "&subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  function validForm(form) {
    form.querySelectorAll("input, textarea").forEach(function (field) {
      field.setCustomValidity(field.required && !field.value.trim() ? "Completa este campo." : "");
    });
    return form.reportValidity();
  }

  function summaryFallback(summary, message) {
    summary.focus();
    summary.select();
    message.textContent = "Selecciona y copia el resumen, o descárgalo. Después envíalo por correo a hackgorithmic@gmail.com.";
  }

  async function copySummary(summary, message) {
    try {
      await navigator.clipboard.writeText(summary.value);
      message.textContent = "Resumen copiado. Pégalo en un correo a hackgorithmic@gmail.com y envíalo.";
    } catch (_) {
      summaryFallback(summary, message);
    }
  }

  function downloadSummary(summary, message, filename) {
    let objectUrl = "";
    let anchor;
    try {
      objectUrl = URL.createObjectURL(new Blob(["\uFEFF" + summary.value], { type: "text/plain;charset=utf-8" }));
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      message.textContent = "Descarga preparada. Adjúntala en un correo a hackgorithmic@gmail.com y envíalo.";
    } catch (_) {
      summaryFallback(summary, message);
    } finally {
      if (anchor) anchor.remove();
      if (objectUrl) setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
    }
  }

  function bindDelivery(form, prefix, refresh, filename) {
    const summary = byId(prefix + "summary");
    const message = byId(prefix + "msg");
    const check = function () {
      refresh();
      if (validForm(form)) return true;
      message.textContent = "Revisa los campos indicados antes de preparar o compartir el resumen.";
      return false;
    };
    byId(prefix + "send").addEventListener("click", function (event) {
      if (!check()) {
        event.preventDefault();
        return;
      }
      message.textContent = "Mensaje preparado. En tu aplicación de correo, revisa y pulsa Enviar. Si no se abre, copia o descarga el resumen.";
    });
    byId(prefix + "copy").addEventListener("click", function () {
      if (check()) copySummary(summary, message);
    });
    byId(prefix + "download").addEventListener("click", function () {
      if (check()) downloadSummary(summary, message, filename);
    });
    form.addEventListener("input", function (event) {
      if (typeof event.target.setCustomValidity === "function") event.target.setCustomValidity("");
      message.textContent = "";
      refresh();
    });
    form.addEventListener("submit", function (event) { event.preventDefault(); });
  }

  if (planForm) {
    const refreshPlan = function () {
      const selectedPlan = byId("splan").value;
      const validPlan = Object.prototype.hasOwnProperty.call(PLANS, selectedPlan);
      byId("splan").setCustomValidity(validPlan ? "" : "Elige uno de los tres planes.");
      const label = validPlan ? PLANS[selectedPlan] : "(elige un plan)";
      const body = [
        "Consulta de plan — hackgorithmic 3D",
        "Plan de interés: " + label,
        "Nombre: " + (byId("sname").value.trim() || "No indicado"),
        "Email de contacto: " + (byId("semail").value.trim() || "(falta)"),
        "",
        "Idea y medidas:",
        byId("sidea").value.trim() || "(describe tu idea)",
        "",
        "Solicito información y confirmación del alcance del plan.",
        "La impresión física y el envío se cotizan por separado."
      ].join("\n");
      byId("ssummary").value = body;
      byId("ssend").href = mailto("Consulta de plan — " + label, body);
    };
    bindDelivery(planForm, "s", refreshPlan, "consulta-plan-hackgorithmic.txt");
    document.querySelectorAll("a[data-subscription-plan]").forEach(function (anchor) {
      anchor.addEventListener("click", function () {
        if (anchor.getAttribute("href") !== "#solicitar-plan") return;
        const name = anchor.getAttribute("data-subscription-plan");
        if (!Object.prototype.hasOwnProperty.call(PLANS, name)) return;
        byId("splan").value = name;
        byId("smsg").textContent = "Plan seleccionado: " + PLANS[name] + ". Completa tu consulta.";
        refreshPlan();
        setTimeout(function () { byId("splan").focus({ preventScroll: true }); }, 0);
      });
    });
    refreshPlan();
  }

  if (orderForm) {
    bindDelivery(orderForm, "o", function () {
      if (typeof window.syncOrder === "function") window.syncOrder();
    }, "solicitud-llaveros-hackgorithmic.txt");
  }
})();
