/**
 * Dispara GA4 (generate_lead) e, se configurado, conversão Google Ads.
 * Incluir depois de gtag-init.js e ads-conversion-config.js.
 */
(function () {
  function fire() {
    if (typeof gtag !== 'function') return;

    gtag('event', 'generate_lead', { method: 'confirmacao_reserva' });

    var sendTo = (window.EXCLUSIVA_GOOGLE_ADS_SEND_TO || '').trim();
    var awId = (window.EXCLUSIVA_GOOGLE_ADS_ID || '').trim();
    if (!awId && sendTo && sendTo.indexOf('/') > 0) {
      awId = sendTo.split('/')[0].trim();
    }
    if (awId) {
      gtag('config', awId);
    }
    if (sendTo) {
      gtag('event', 'conversion', { send_to: sendTo });
    }
  }

  if (document.readyState === 'complete') {
    fire();
  } else {
    window.addEventListener('load', fire);
  }
})();
