import { applyTheme } from "./theme.js"

const modalChrome = `
<style>
  :host { all: initial; }
  .back {
    box-sizing: border-box;
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: color-mix(in srgb, var(--text) 35%, transparent);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text);
    color-scheme: var(--scheme);
  }
  .modal {
    box-sizing: border-box;
    width: min(720px, 100%);
    max-height: min(80vh, 640px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--edge, color-mix(in srgb, var(--text) 22%, var(--bg)));
    border-radius: 16px;
    overflow: hidden;
  }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; }
  h2 { margin: 0; font-size: 20px; font-weight: 800; }
  button.close { border: 0; background: transparent; color: var(--accent); font-size: 17px; padding: 0; }
  .sheet { overflow: auto; min-height: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 12px; border-top: 1px solid var(--edge, color-mix(in srgb, var(--text) 22%, var(--bg))); vertical-align: top; }
  th { font-size: 13px; color: var(--muted); font-weight: 700; }
  td.text { white-space: pre-wrap; word-break: break-word; }
  input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
</style>
<div class="back">
  <div class="modal" role="dialog" aria-modal="true" aria-label="Tweets encontrados">
    <header>
      <h2>Tweets encontrados</h2>
      <button class="close" type="button" data-action="close">Fechar</button>
    </header>
    <div class="sheet">
      <table>
        <thead><tr><th></th><th>Tipo</th><th>Data</th><th>Texto</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
</div>`

export function modalMarkup() {
    return modalChrome
}

export function showDate(value) {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    const day = String(date.getUTCDate()).padStart(2, "0")
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    return `${day}/${month}/${date.getUTCFullYear()}`
}

export function openSearchModal(document, theme) {
    const host = document.createElement("div")
    host.setAttribute("data-x-deleter-modal", "")
    const shadow = host.attachShadow({ mode: "open" })
    shadow.innerHTML = modalChrome
    applyTheme(host, theme)
    host.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;"
    const body = shadow.querySelector("tbody")
    const api = {
        stopped: false,
        addTweet(tweet) {
            if (api.stopped) return
            const row = document.createElement("tr")
            const pick = document.createElement("td")
            const box = document.createElement("input")
            box.type = "checkbox"
            box.checked = true
            box.dataset.id = tweet.id
            pick.append(box)
            const type = document.createElement("td")
            type.textContent = tweet.type
            const date = document.createElement("td")
            date.textContent = showDate(tweet.date)
            const text = document.createElement("td")
            text.className = "text"
            text.textContent = tweet.text
            row.append(pick, type, date, text)
            body.append(row)
        },
        close() {
            api.stopped = true
            host.remove()
        },
    }
    shadow.querySelector("[data-action=close]").addEventListener("click", () => api.close())
    shadow.querySelector(".back").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) api.close()
    })
    document.body.append(host)
    return api
}
