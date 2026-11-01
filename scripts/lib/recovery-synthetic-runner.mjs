// Deliberately synthetic adapter: no model, network, credentials, or board access.
// Useful for exercising the runner protocol only; it always answers unknown.
let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
if (request.model !== 'synthetic-unknown-v1') throw new Error('synthetic adapter only accepts synthetic-unknown-v1');
process.stdout.write(`${JSON.stringify({ model: request.model, answers: request.questions.map(({ id }) => ({
  question: id, answer: 'Synthetic transport fixture: unknown.', cites: [], stance: 'unknown',
})), supplementaryReads: 0 })}\n`);
