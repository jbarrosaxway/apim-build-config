# apim-build-config

Repositório de configurações de build (rulesets, scripts de relatório). O consumidor final do produto não precisa deste repositório; ele é dependência dos pipelines.

## Conteúdo

- **`.spectral.yaml`** – Regras Spectral (OAS, AsyncAPI, regras customizadas de qualidade e segurança).
- **`scripts/spectral-report.js`** – Gera `spectral-report.md` e `spectral-lint-results.json` no workspace do projeto consumidor.
- **`package.json`** – Dependências `@stoplight/spectral-cli` e `@stoplight/spectral-owasp-ruleset`.

## Uso nos workflows

1. Checkout deste repositório em `build-config/` (no repositório do projeto, ex.: `demo-apimcli`).
2. Instalar dependências: `npm ci --prefix build-config` (ou `npm install --prefix build-config`).
3. Executar o relatório com o workspace do projeto como raiz:

```bash
export SPECTRAL_WORKSPACE="$GITHUB_WORKSPACE"
node build-config/scripts/spectral-report.js
```

O script procura especificações em `examples/OAS` e `exported-apis` dentro de `SPECTRAL_WORKSPACE` (por defeito, o diretório atual de trabalho).

## Uso local (a partir do projeto consumidor)

```bash
git clone https://github.com/jbarrosaxway/apim-build-config.git build-config
cd build-config && npm install && cd ..
SPECTRAL_WORKSPACE=$(pwd) node build-config/scripts/spectral-report.js
```

## Acesso

Repositório público para permitir checkout com `GITHUB_TOKEN` a partir de outros workflows. Para repositório privado, use um PAT no secret `BUILD_CONFIG_ACCESS_TOKEN`.
