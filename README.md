# x-deleter

Apaga os próprios tweets no X.

`node scripts/build.mjs` gera `x-deleter.js`. Cole esse arquivo no console de x.com, já logado. O painel abre na lateral direita. O botão Apagar usa as configurações rápidas da tela. A engrenagem abre Configurações Avançadas, onde um fetch ou um cURL do Chrome grava o slot em `localStorage` (`x-deleter.config.v1`) quando não há placeholder ambíguo. O nome de cada slot abre o preenchimento manual. Restaurar devolve o padrão do repositório. Sem transaction id no slot usado, nada é enviado e o log diz qual slot falta. O plano está na issue 1.
