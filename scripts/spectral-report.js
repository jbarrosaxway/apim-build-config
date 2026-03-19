#!/usr/bin/env node
/**
 * Gera relatório de maturidade API com Spectral (alinhado Amplify Engage).
 * Vive no repositório de build config; o projeto consumidor define o workspace.
 *
 * Uso: node build-config/scripts/spectral-report.js [specs...]
 *      SPECTRAL_WORKSPACE=/caminho/do/projeto node scripts/spectral-report.js
 *      SPECTRAL_SPECS="a.json b.yaml" node scripts/spectral-report.js
 *
 * Por defeito: workspace = cwd; procura examples/OAS e exported-apis no workspace.
 * Ruleset: .spectral.yaml junto a este script (pasta pai do scripts/).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const configRoot = path.resolve(__dirname, '..');

function workspaceRoot() {
  return path.resolve(process.env.SPECTRAL_WORKSPACE || process.cwd());
}

const REPORT_NAME = 'spectral-report.md';
const RESULTS_NAME = 'spectral-lint-results.json';

function getStatus(score) {
  if (score >= 90) return '✅ Excelente';
  if (score >= 70) return '🟢 Bom';
  if (score >= 50) return '⚠️ Atenção';
  return '🚨 Crítico';
}

function getAmplifyGrade(counts) {
  const { errors, warnings } = counts;
  if (errors >= 5) return 'F';
  if (errors >= 1) return 'E';
  if (warnings >= 5) return 'D';
  if (warnings >= 1) return 'C';
  return 'A';
}

function calculateScore(results) {
  let securityScore = 100;
  let designScore = 100;
  let securityErrors = 0, securityWarnings = 0, securityInfos = 0, securityHints = 0;
  let designErrors = 0, designWarnings = 0, designInfos = 0, designHints = 0;

  results.forEach((r) => {
    const isSecurity = r.code && (r.code.startsWith('owasp:') || r.code.startsWith('security-'));
    if (isSecurity) {
      if (r.severity === 0) { securityErrors++; securityScore -= 5; }
      else if (r.severity === 1) { securityWarnings++; securityScore -= 2; }
      else if (r.severity === 2) securityInfos++;
      else if (r.severity === 3) securityHints++;
    } else {
      if (r.severity === 0) { designErrors++; designScore -= 3; }
      else if (r.severity === 1) { designWarnings++; designScore -= 1; }
      else if (r.severity === 2) designInfos++;
      else if (r.severity === 3) designHints++;
    }
  });

  const finalSecurityScore = Math.max(0, securityScore);
  const finalDesignScore = Math.max(0, designScore);
  const totalScore = Math.round((finalSecurityScore + finalDesignScore) / 2);
  const totalCounts = {
    errors: securityErrors + designErrors,
    warnings: securityWarnings + designWarnings,
    infos: securityInfos + designInfos,
    hints: securityHints + designHints,
  };

  return {
    totalScore,
    securityScore: finalSecurityScore,
    designScore: finalDesignScore,
    securityCounts: { errors: securityErrors, warnings: securityWarnings, infos: securityInfos, hints: securityHints },
    designCounts: { errors: designErrors, warnings: designWarnings, infos: designInfos, hints: designHints },
    amplifyGrade: getAmplifyGrade(totalCounts),
  };
}

function parseSpectralOutput(stdout) {
  const jsonStart = stdout.indexOf('[');
  const jsonEnd = stdout.lastIndexOf(']');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    return JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));
  }
  return JSON.parse(stdout);
}

function buildMarkdownReport(results, scoreInfo, generatedAt) {
  const { totalScore, securityScore, designScore, securityCounts, designCounts, amplifyGrade } = scoreInfo;
  let md = `# Relatório de Maturidade API (Spectral)

Gerado em: ${generatedAt}

## Nota de Conformidade: ${amplifyGrade}
## Score Numérico: ${results.length === 0 ? 100 : totalScore}/100

| Categoria | Score | Status |
| :--- | :--- | :--- |
| 🛡️ Segurança | ${securityScore}/100 | ${getStatus(securityScore)} |
| 🎨 Design | ${designScore}/100 | ${getStatus(designScore)} |

### Detalhes das Ocorrências
- **Segurança**: ${securityCounts.errors} erros, ${securityCounts.warnings} avisos.
- **Design**: ${designCounts.errors} erros, ${designCounts.warnings} avisos.

## Tabela de Problemas (Top 100)

| Severidade | Código | Mensagem | Caminho | Linha | Arquivo |
| :--- | :--- | :--- | :--- | :--- | :--- |
`;

  const severityMap = { 0: '🔴 Erro', 1: '🟡 Aviso', 2: '🔵 Info', 3: '⚪ Hint' };
  results.slice(0, 100).forEach((issue) => {
    const severity = severityMap[issue.severity] ?? issue.severity;
    const pathStr = (issue.path && issue.path.join('.')) || '-';
    const line = issue.range && issue.range.start ? issue.range.start.line + 1 : '-';
    const source = issue.source ? path.basename(issue.source) : '-';
    md += `| ${severity} | ${(issue.code || '').replace(/\|/g, '\\|')} | ${(issue.message || '').replace(/\|/g, '\\|')} | \`${pathStr}\` | ${line} | ${source} |\n`;
  });

  return md;
}

function findSpecFiles(root) {
  const result = [];
  const oasDir = path.join(root, 'examples', 'OAS');
  if (fs.existsSync(oasDir)) {
    for (const name of fs.readdirSync(oasDir)) {
      const ext = path.extname(name).toLowerCase();
      if (['.json', '.yaml', '.yml'].includes(ext)) {
        result.push(path.join(oasDir, name));
      }
    }
  }
  const exportedDir = path.join(root, 'exported-apis');
  if (fs.existsSync(exportedDir)) {
    for (const dirName of fs.readdirSync(exportedDir, { withFileTypes: true })) {
      if (dirName.isDirectory()) {
        const spec = path.join(exportedDir, dirName.name, 'api-specification.yaml');
        const specYml = path.join(exportedDir, dirName.name, 'api-specification.yml');
        if (fs.existsSync(spec)) result.push(spec);
        else if (fs.existsSync(specYml)) result.push(specYml);
      }
    }
  }
  return result;
}

function resolveRuleset() {
  if (process.env.SPECTRAL_RULESET) {
    const p = path.resolve(process.env.SPECTRAL_RULESET);
    if (fs.existsSync(p)) return p;
  }
  const y = path.join(configRoot, '.spectral.yaml');
  const yml = path.join(configRoot, '.spectral.yml');
  if (fs.existsSync(y)) return y;
  if (fs.existsSync(yml)) return yml;
  return null;
}

function main() {
  const ws = workspaceRoot();
  const reportPath = path.join(ws, REPORT_NAME);
  const resultsPath = path.join(ws, RESULTS_NAME);

  let specFiles = process.env.SPECTRAL_SPECS
    ? process.env.SPECTRAL_SPECS.split(/\s+/).filter(Boolean).map((f) => path.resolve(ws, f))
    : process.argv.slice(2).map((f) => path.resolve(ws, f));

  if (specFiles.length === 0) {
    specFiles = findSpecFiles(ws);
  }

  if (specFiles.length === 0) {
    console.warn('Nenhum arquivo de especificação encontrado. Defina SPECTRAL_SPECS ou paths no workspace:', ws);
    fs.writeFileSync(reportPath, '# Relatório de Maturidade API (Spectral)\n\nNenhuma especificação OpenAPI/AsyncAPI encontrada para análise.\n', 'utf8');
    process.exit(0);
    return;
  }

  const rulesetPath = resolveRuleset();
  if (!rulesetPath) {
    console.error('Nenhum ruleset Spectral encontrado em', configRoot);
    process.exit(1);
  }

  const specArgs = specFiles.map((f) => `"${f}"`).join(' ');
  const cmd = `npx spectral lint ${specArgs} --ruleset "${rulesetPath}" -f json`;
  let results = [];
  let exitCode = 0;

  try {
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      cwd: configRoot,
    });
    results = parseSpectralOutput(stdout);
  } catch (e) {
    if (e.stdout) {
      results = parseSpectralOutput(e.stdout);
    }
    exitCode = e.status ?? 1;
  }

  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');

  const scoreInfo = calculateScore(results);
  const reportMd = buildMarkdownReport(results, scoreInfo, new Date().toISOString());
  fs.writeFileSync(reportPath, reportMd, 'utf8');

  console.log('Relatório gerado:', reportPath);
  console.log('Nota:', scoreInfo.amplifyGrade, '| Score:', scoreInfo.totalScore);
  process.exit(exitCode);
}

main();
