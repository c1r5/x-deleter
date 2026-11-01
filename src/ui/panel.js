import { analyze } from "./capture.js"
import { openSlot, presentManual, slotFromForm } from "./manual.js"
import { watchPlacement } from "./place.js"
import { applyTheme, sampleTheme } from "./theme.js"

const chevron = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19 L8 12 L15 5"/></svg>`

const markup = `
<style>
  :host { all: initial; }
  .wrap {
    --edge: color-mix(in srgb, var(--text) 22%, var(--bg));
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px 16px 16px;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
    color-scheme: var(--scheme);
    border: 1px solid var(--edge);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    transition: background-color 0.2s ease;
  }
  .wrap:hover { background: color-mix(in srgb, var(--text) 5%, var(--bg)); }
  .screen { display: none; flex: 1 1 auto; min-height: 0; flex-direction: column; gap: 12px; overflow: auto; }
  .screen.on { display: flex; }
  header { display: flex; align-items: center; justify-content: space-between; min-height: 53px; }
  h2 { margin: 0; font-size: 20px; font-weight: 800; line-height: 1.2; min-width: 0; }
  button.icon { width: 34px; height: 34px; border: 0; border-radius: 999px; background: transparent; color: var(--text); transition: background-color 0.2s ease; }
  button.icon:hover { background: color-mix(in srgb, var(--text) 10%, transparent); }
  button.icon svg { width: 20px; height: 20px; }
  a.back { display: inline-flex; align-items: center; gap: 2px; color: var(--accent); text-decoration: none; font-weight: 400; font-size: 17px; }
  a.back svg { width: 22px; height: 22px; flex: none; }
  .logs { flex: none; height: 112px; overflow: auto; border: 1px solid var(--edge); border-radius: 16px; padding: 12px 14px; background: var(--surface); font-family: ui-monospace, monospace; font-size: 13px; line-height: 1.5; transition: background-color 0.2s ease; }
  .logs:hover { background: color-mix(in srgb, var(--text) 8%, var(--surface)); }
  .progress { height: 4px; border-radius: 999px; background: var(--line); overflow: hidden; }
  .progress > span { display: block; height: 100%; width: 0; background: var(--accent); }
  .status-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 15px; }
  .meter { flex: none; }
  .status-row .k { color: var(--muted); }
  .pill { border: 1px solid var(--edge); border-radius: 999px; padding: 2px 10px; font-weight: 700; font-size: 13px; background: var(--surface); color: var(--accent); }
  .quick, .setup { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--edge); border-radius: 16px; padding: 12px 14px; background: var(--surface); transition: background-color 0.2s ease; }
  .quick:hover, .setup:hover { background: color-mix(in srgb, var(--text) 8%, var(--surface)); }
  .quick h3 { margin: 0; font-size: 15px; font-weight: 800; }
  .marks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; max-height: calc(3 * 24px + 16px); overflow-y: auto; }
  .marks label { min-width: 0; min-height: 24px; }
  label { display: flex; align-items: center; gap: 8px; font-size: 15px; }
  label.field, label.date { flex-direction: column; align-items: stretch; gap: 4px; font-size: 13px; color: var(--muted); }
  .dates { display: flex; flex-wrap: wrap; gap: 8px; }
  .dates .date { flex: 1 1 9rem; min-width: 0; }
  input, button.primary, textarea { font: inherit; color: var(--text); }
  input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; }
  input[type="date"], input[type="text"] { width: 100%; box-sizing: border-box; border: 1px solid var(--edge); border-radius: 4px; padding: 8px 10px; background: var(--bg); transition: background-color 0.2s ease; }
  input[type="date"]:hover, input[type="text"]:hover { background: color-mix(in srgb, var(--text) 8%, var(--bg)); }
  textarea.curl { min-height: 120px; border: 1px solid var(--edge); border-radius: 16px; padding: 12px 14px; background: var(--surface); font-family: ui-monospace, monospace; font-size: 13px; transition: background-color 0.2s ease; }
  textarea.curl:hover { background: color-mix(in srgb, var(--text) 8%, var(--surface)); }
  button.primary { border: 0; border-radius: 999px; padding: 8px 16px; background: var(--btn-bg); color: var(--btn-text); font-weight: 700; transition: background-color 0.2s ease; }
  button.primary:hover { background: color-mix(in srgb, var(--btn-text) 12%, var(--btn-bg)); }
  button.primary:disabled { opacity: 0.6; }
  .file { display: none; }
  .file.on { display: flex; justify-content: space-between; }
  button.file-btn { border: 1px solid var(--edge); border-radius: 999px; background: var(--bg); color: var(--text); padding: 6px 12px; transition: background-color 0.2s ease; }
  button.file-btn:hover { background: color-mix(in srgb, var(--text) 8%, var(--bg)); }
  ul.setup { list-style: none; margin: 0; padding: 0; }
  ul.setup li { display: flex; align-items: center; gap: 10px; font-size: 15px; padding: 10px 0; border-bottom: 1px solid var(--edge); }
  button.name { border: 0; background: transparent; color: var(--accent); font-weight: 700; font-size: 15px; padding: 0; }
  .hint { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.35; }
  select, textarea.box { border: 1px solid var(--edge); border-radius: 4px; padding: 8px 10px; background: var(--bg); width: 100%; box-sizing: border-box; transition: background-color 0.2s ease; }
  select:hover, textarea.box:hover { background: color-mix(in srgb, var(--text) 8%, var(--bg)); }
  textarea.box { font-family: ui-monospace, monospace; font-size: 12.5px; }
  ul.candidates { margin: 0; padding-left: 18px; color: var(--muted); font-size: 13px; }
  .actions { display: flex; gap: 8px; }
</style>
<div class="wrap">
  <section class="screen main on" data-screen="main">
    <header>
      <h2>Tweet deleter</h2>
      <button class="icon" type="button" aria-label="Configurações Avançadas">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6"/></svg>
      </button>
    </header>
    <section class="quick">
      <h3>Configurações rápidas</h3>
      <div class="marks">
        <label><input type="checkbox" data-field="fromArchive"> Do arquivo</label>
        <label><input type="checkbox" data-field="unretweet" checked> Desfazer retweets</label>
        <label><input type="checkbox" data-field="keepPinned" checked> Manter o fixado</label>
        <label><input type="checkbox" data-field="urlsOnly"> Só com link</label>
        <label><input type="checkbox" data-field="oldTweets"> Tweets antigos</label>
        <label><input type="checkbox" data-field="reposts"> Reposts</label>
      </div>
      <div class="dates">
        <label class="date">De <input type="date" data-field="afterDate" value="1900-01-01"></label>
        <label class="date">Até <input type="date" data-field="beforeDate" value="2026-10-30"></label>
      </div>
      <label class="field">Palavras <input type="text" data-field="keywords"></label>
      <label class="field">Ignorar estes IDs <input type="text" data-field="ignoreIds"></label>
      <label class="field">Apagar só estes IDs <input type="text" data-field="onlyIds"></label>
      <div class="file"><span>Arquivo do export</span><button class="file-btn" type="button">Escolher</button></div>
      <button class="primary" type="button">Apagar</button>
    </section>
  </section>
  <section class="screen advanced" data-screen="advanced">
    <header><h2>Configurações Avançadas</h2></header>
    <a class="back" data-action="back-main" href="#main">${chevron}Tweet deleter</a>
    <textarea class="curl" placeholder="Cole um cURL ou um Copy as fetch"></textarea>
    <div><button class="primary" type="button" data-action="analyze">Analisar</button></div>
    <p class="hint">Clique no nome para o preenchimento manual. A caixa marca a configuração pronta.</p>
    <ul class="setup">
      <li><input type="checkbox" disabled data-ready="replies"> <button class="name" type="button" data-slot="replies">Buscar respostas</button></li>
      <li><input type="checkbox" disabled data-ready="old"> <button class="name" type="button" data-slot="old">Buscar tweets antigos</button></li>
      <li><input type="checkbox" disabled data-ready="reposts"> <button class="name" type="button" data-slot="reposts">Buscar reposts</button></li>
      <li><input type="checkbox" disabled data-ready="delete"> <button class="name" type="button" data-slot="delete">Apagar tweet</button></li>
    </ul>
    <div><button class="primary" type="button" data-action="restore-all">Restaurar tudo</button></div>
  </section>
  <section class="screen manual" data-screen="manual">
    <header><h2>Apagar tweet</h2></header>
    <a class="back" data-action="back-advanced" href="#advanced">${chevron}Configurações Avançadas</a>
    <div class="quick">
      <label class="field">Método <select data-field="method"><option>GET</option><option>POST</option></select></label>
      <label class="field">Caminho <input type="text" data-field="path"></label>
      <div data-part="post">
        <label class="field">Status de sucesso <input type="text" data-field="successStatus"></label>
        <label class="field">Content-Type <input type="text" data-field="contentType"></label>
        <label class="field">Corpo <textarea class="box" data-field="body" rows="7"></textarea></label>
      </div>
      <div data-part="search">
        <label class="field">Variáveis <textarea class="box" data-field="variables" rows="5"></textarea></label>
        <label class="field">Features <textarea class="box" data-field="features" rows="3"></textarea></label>
      </div>
      <ul class="candidates"></ul>
      <div class="actions">
        <button class="primary" type="button" data-action="save">Guardar</button>
        <button class="primary" type="button" data-action="restore">Restaurar</button>
      </div>
    </div>
  </section>
  <div class="meter">
    <div class="progress"><span></span></div>
    <div class="status-row"><span class="k">status</span> <span class="pill">idle</span></div>
  </div>
  <div class="logs"></div>
</div>`

export function panelMarkup() {
    return markup
}

export function showAnalyze(button, area, work, view) {
    const text = area.value
    button.disabled = true
    button.textContent = "Analisando..."
    view.setTimeout(() => {
        try {
            work(text)
        } finally {
            area.value = ""
            button.textContent = "Analisar"
            button.disabled = false
        }
    }, 0)
}

export function mountPanel(document, view, handlers) {
    const host = document.createElement("div")
    const shadow = host.attachShadow({ mode: "open" })
    shadow.innerHTML = markup
    const root = shadow.querySelector(".wrap")
    const logs = shadow.querySelector(".logs")
    const bar = shadow.querySelector(".progress > span")
    const pill = shadow.querySelector(".pill")
    const fileRow = shadow.querySelector(".file")
    let fileText = ""
    let pending = null

    function fillManual(state) {
        const screen = shadow.querySelector("[data-screen=manual]")
        screen.dataset.slot = state.slotKey
        screen.querySelector("h2").textContent = state.title
        shadow.querySelector("[data-field=method]").value = state.method
        shadow.querySelector("[data-field=path]").value = state.path
        shadow.querySelector("[data-field=successStatus]").value = state.successStatus
        shadow.querySelector("[data-field=contentType]").value = state.contentType
        shadow.querySelector("[data-field=variables]").value = state.variables
        shadow.querySelector("[data-field=features]").value = state.features
        shadow.querySelector("[data-field=body]").value = state.body
        shadow.querySelector("[data-part=search]").hidden = !state.search
        shadow.querySelector("[data-part=post]").hidden = state.search
        const list = shadow.querySelector(".candidates")
        list.replaceChildren()
        for (const candidate of state.candidates) {
            const item = document.createElement("li")
            item.textContent = candidate
            list.append(item)
        }
    }

    function markReady(key, ready) {
        const box = shadow.querySelector(`[data-ready="${key}"]`)
        if (box) box.checked = ready
    }

    function formFields() {
        return {
            method: shadow.querySelector("[data-field=method]").value,
            path: shadow.querySelector("[data-field=path]").value,
            successStatus: shadow.querySelector("[data-field=successStatus]").value,
            contentType: shadow.querySelector("[data-field=contentType]").value,
            variables: shadow.querySelector("[data-field=variables]").value,
            features: shadow.querySelector("[data-field=features]").value,
            body: shadow.querySelector("[data-field=body]").value,
        }
    }

    function show(name) {
        for (const screen of shadow.querySelectorAll(".screen")) {
            screen.classList.toggle("on", screen.dataset.screen === name)
        }
    }

    function paint() {
        applyTheme(root, sampleTheme(document, view))
    }
    paint()
    const observer = new view.MutationObserver(paint)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] })
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] })

    const slots = handlers.slots ? handlers.slots() : null
    if (slots) {
        for (const key of ["replies", "old", "reposts", "delete"]) {
            const box = shadow.querySelector(`[data-ready="${key}"]`)
            if (box) box.checked = Boolean(slots[key] && slots[key].transactionId)
        }
    }

    shadow.querySelector("[data-field=fromArchive]").addEventListener("change", (event) => {
        fileRow.classList.toggle("on", event.target.checked)
    })
    shadow.querySelector(".file-btn").addEventListener("click", () => {
        const input = document.createElement("input")
        input.type = "file"
        input.onchange = () => {
            const file = input.files && input.files[0]
            if (!file) return
            const reader = new view.FileReader()
            reader.onload = () => {
                fileText = String(reader.result || "")
            }
            reader.readAsText(file)
        }
        input.click()
    })
    shadow.querySelector("button.icon").addEventListener("click", () => show("advanced"))
    shadow.querySelector("[data-action=back-main]").addEventListener("click", (event) => {
        event.preventDefault()
        show("main")
    })
    shadow.querySelector("[data-action=back-advanced]").addEventListener("click", (event) => {
        event.preventDefault()
        show("advanced")
    })
    for (const button of shadow.querySelectorAll("[data-slot]")) {
        button.addEventListener("click", () => {
            fillManual(openSlot(button.dataset.slot, handlers.slots(), pending))
            show("manual")
        })
    }
    shadow.querySelector("[data-action=analyze]").addEventListener("click", () => {
        const button = shadow.querySelector("[data-action=analyze]")
        const area = shadow.querySelector("textarea.curl")
        showAnalyze(button, area, (text) => {
            const result = analyze(text, {
                panel,
                saveSlot: handlers.saveSlot,
                openManual(parsed) {
                    pending = parsed
                    if (!parsed.slotKey) return
                    fillManual(openSlot(parsed.slotKey, handlers.slots(), parsed))
                    show("manual")
                },
            })
            if (!result || !result.ok) return
            if (!result.slotKey) {
                pending = result
                return
            }
            if (result.ambiguous) return
            pending = null
            markReady(result.slotKey, Boolean(result.slot.transactionId))
        }, view)
    })
    shadow.querySelector("[data-action=save]").addEventListener("click", () => {
        const key = shadow.querySelector("[data-screen=manual]").dataset.slot
        const result = slotFromForm(key, formFields(), handlers.slots()[key])
        if (!result.ok) {
            panel.log(result.error)
            return
        }
        handlers.saveSlot(key, result.slot)
        pending = null
        markReady(key, Boolean(result.slot.transactionId))
        show("advanced")
    })
    shadow.querySelector("[data-action=restore]").addEventListener("click", () => {
        const key = shadow.querySelector("[data-screen=manual]").dataset.slot
        handlers.restoreSlot(key)
        pending = null
        const slot = handlers.slots()[key]
        fillManual(presentManual(key, slot, []))
        markReady(key, Boolean(slot.transactionId))
    })
    shadow.querySelector("[data-action=restore-all]").addEventListener("click", () => {
        handlers.restoreAll()
        pending = null
        const slots = handlers.slots()
        for (const key of ["replies", "old", "reposts", "delete"]) markReady(key, Boolean(slots[key].transactionId))
    })
    shadow.querySelector(".screen.main .primary").addEventListener("click", () => {
        const fields = {}
        for (const input of shadow.querySelector(".screen.main").querySelectorAll("[data-field]")) {
            fields[input.dataset.field] = input.type === "checkbox" ? input.checked : input.value
        }
        handlers.onStart(fields, fileText, panel)
    })

    const panel = {
        log(line) {
            const row = document.createElement("div")
            row.textContent = line
            logs.append(row)
        },
        progress({ done, total }) {
            bar.style.width = total ? `${(done / total) * 100}%` : "0"
        },
        setStatus(status) {
            pill.textContent = status
        },
    }
    watchPlacement(host, document, view)
    return panel
}
