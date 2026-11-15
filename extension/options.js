// Options page: load and save the two keys. Nothing else.
const FIELDS = ["anthropicApiKey", "githubToken"];
const status = document.getElementById("status");

chrome.storage.local.get(FIELDS).then((saved) => {
  for (const id of FIELDS) document.getElementById(id).value = saved[id] || "";
});

document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = {};
  for (const id of FIELDS) values[id] = document.getElementById(id).value.trim();
  await chrome.storage.local.set(values);
  status.textContent = "Saved";
  setTimeout(() => (status.textContent = ""), 2000);
});
