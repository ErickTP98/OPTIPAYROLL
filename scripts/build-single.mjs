// Genera dist/optipayroll.html: una sola página con el JS y el CSS incrustados,
// lista para abrir sin servidor o publicar como página independiente.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const assets = readdirSync("dist/assets");
const read = (ext) => assets.filter((f) => f.endsWith(ext)).map((f) => readFileSync(`dist/assets/${f}`, "utf8")).join("\n");
const js = read(".js").replace(/<\/script/gi, "<\\/script");
const css = read(".css").replace(/<\/style/gi, "<\\/style");

const html = `<title>OptiPayroll</title>
<meta name="description" content="Presupuesto de nóminas: trabajadores, puestos, conceptos, beneficios sociales, aportes patronales e incrementos.">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
writeFileSync("dist/optipayroll.html", html);
console.log(`dist/optipayroll.html (${(html.length / 1024).toFixed(0)} KB)`);
