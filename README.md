# apim-build-config

Repositório interno de configurações de build. Não exposto ao usuário final.

## Conteúdo

- **`.spectral.yaml`** – Regras Spectral para lint de especificações OpenAPI/AsyncAPI (OAS, AsyncAPI, regras customizadas de qualidade e segurança).

## Uso

Este repositório é referenciado como dependência por workflows do GitHub Actions (ex.: `demo-apimcli`). Os workflows fazem checkout deste repo em um diretório (ex.: `build-config`) e usam o ruleset com `--ruleset build-config/.spectral.yaml`.

## Acesso

Repositório privado. Para que um workflow em outro repositório use este config, é necessário um token com permissão de leitura (ex.: PAT ou `BUILD_CONFIG_ACCESS_TOKEN`) ao configurar o checkout do repositório.
