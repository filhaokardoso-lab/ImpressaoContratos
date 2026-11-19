# ImpressaoContratos

Central de Contratos do Grupo Bom Jesus. Escolha Serviço (SIGO), Material e serviço ou Homologação, preencha os dados e confira o documento antes de exportar.

## Executar localmente

Na raiz do repositório, execute:

```sh
python -m http.server 8000 --directory dist
```

Abra http://localhost:8000 no navegador. A aplicação é estática e os dados preenchidos são processados no navegador.

A ficha SIGO de pessoa física usa o PDF-base e oferece download direto. Os demais modelos usam a opção de impressão do navegador para salvar em PDF.
