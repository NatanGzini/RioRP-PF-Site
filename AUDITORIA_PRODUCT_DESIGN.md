# Auditoria Product Design — PF / RIO RP

Data: 19/10/2026. Revisão combinada de UX, apresentação visual e acessibilidade aparente, realizada com o plugin Product Design após sua instalação.

## Escopo e método

Portal publicado: https://pf-rio-rp-academia.aqua-vine-5176.chatgpt.site/

Fluxo examinado: apresentação → entrada na academia; apresentação/menu → denúncias. Capturas novas desta rodada, salvas e inspecionadas no navegador interno. Evidências em `outputs/product-design-audit/`. As imagens de revisões anteriores não foram utilizadas como evidência desta auditoria.

## 1. Início — bom

![Página inicial](outputs/product-design-audit/01-inicio.png)

O emblema está íntegro; a identificação RIO RP permanece visível; preto/dourado é consistente e o botão Discord tem destaque de ação principal. A denúncia aparece como ação secundária. Textos decorativos de coordenadas e lema são pequenos; não contêm instruções essenciais. Não se recomenda alterar o desenho visual nesta etapa apenas para gerar outra variação.

## 2. Entrada na academia — bom

![Entrada na academia](outputs/product-design-audit/02-academia.png)

O formulário apresenta exatamente ID e nome in-game, com instrução de cadastro prévio por instrutor. Não há pedido de código de ativação. O acesso de instrutores aparece separado. A navegação transferiu o foco ao conteúdo. Ao acionar Entrar com os campos vazios, a validação obrigatória foi exibida e o foco retornou ao ID.

Não foi realizado login com uma matrícula real; a área de estudos, provas, certificados e painel administrativo não foi auditada visualmente nesta rodada.

## 3. Denúncia — bom, com dois refinamentos aplicados

![Formulário de denúncia](outputs/product-design-audit/03-denuncia.png)

O contexto de RP e a orientação de não informar dados pessoais são claros. Os campos têm rótulos visíveis e há uma explicação sobre o acesso dos instrutores e os registros técnicos de hospedagem.

Achados da captura inicial:

- A instrução de mínimo de 30 caracteres estava apenas no placeholder do relato, desaparecendo durante a digitação. Foi adicionada uma orientação persistente abaixo do campo, associada semanticamente por `aria-describedby`.
- O título Nova denúncia era um H3 diretamente após o H1 da página. Foi corrigido para H2, preservando a aparência visual.

A captura final desta etapa deve ser confrontada com a publicação corrigida. A captura anterior permanece em `03-denuncia-antes.png` para rastreabilidade. Nenhuma denúncia de teste foi enviada à produção.

## Limites

Esta revisão não certifica conformidade completa com WCAG. Não foram realizados teste com leitor de tela, medição exaustiva de contraste, auditoria de segurança ou teste completo dos percursos autenticados. A visibilidade do portal na sessão atual não demonstra acesso liberado para visitantes: o compartilhamento permanece privado.

## Próxima validação recomendada

Após cadastrar os materiais reais, percorrer uma matrícula de teste: Bíblia Geral → carteirinha; agente → curso → prova → certificado. Essa verificação deve ser feita com conteúdo e conta de teste identificados, sem relatos ou dados de alunos reais.
