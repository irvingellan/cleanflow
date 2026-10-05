document.querySelector("form").addEventListener("submit", async event => {
  event.preventDefault();
  const port = Number(document.getElementById("port").value), pairingKey = document.getElementById("key").value;
  const sources = {};
  for (const [id, domain] of [["hospitable", "my.hospitable.com"], ["guesty", "app.guesty.com"]]) {
    const value = document.getElementById(id).value;
    if (value && !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) return;
    if (value) sources[domain] = value;
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[a-f0-9]{64}$/.test(pairingKey)) return;
  await chrome.storage.local.set({ observer: { port, pairingKey, sources } });
  document.getElementById("key").value = "";
  document.getElementById("status").textContent = "Local pairing saved. No platform credentials read.";
});
