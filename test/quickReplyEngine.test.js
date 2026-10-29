const test = require('node:test');
const assert = require('node:assert/strict');
const { ALLOWED_ACTION_TYPES, generateSuggestionSet, resolvePageKind } = require('../src/quickReplyEngine');

test('the hostname does not determine booking intent', () => {
  assert.equal(resolvePageKind({ url: 'https://booking.example/' }), 'home');
  assert.equal(resolvePageKind({ url: 'https://booking.example/booking' }), 'booking_flow');
  assert.equal(resolvePageKind({ url: 'https://example.test/#/checkout' }), 'booking_flow');
});

test('booking intent suggests missing information using approved actions', () => {
  const result = generateSuggestionSet({
    routerOutput: { primary_intent: 'booking', entities: {} },
    pageContext: { url: 'https://example.test/' },
  });
  assert.deepEqual(result.suggestions.map(item => item.id), [
    'booking.select_date', 'booking.select_service', 'booking.select_branch',
  ]);
  assert.ok(result.suggestions.every(item => ALLOWED_ACTION_TYPES.has(item.actionType)));
  assert.deepEqual(result.quickReplies, result.suggestions.map(item => item.label));
});

test('human handoff suppresses automated suggestions', () => {
  assert.deepEqual(generateSuggestionSet({ conversationStatus: 'human_active' }),
    { suggestions: [], quickReplies: [] });
});
