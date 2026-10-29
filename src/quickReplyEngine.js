/**
 * Controlled suggestion engine for Pana chat.
 *
 * The engine never asks an LLM to invent actions. It ranks approved candidates,
 * applies hard safety/consent filters and exposes both the structured contract
 * and the legacy quickReplies string projection used by installed Android apps.
 */

const MAX_SUGGESTIONS = 3;
const ALLOWED_ACTION_TYPES = new Set([
    'send_message',
    'navigate',
    'open_booking',
    'open_date_picker',
    'view_reward_history',
    'handoff',
]);

function approvedSuggestion({
    id,
    label,
    actionType = 'send_message',
    payload = {},
    source,
    reasonCode,
    requiresConsent = false,
    ttlSeconds = 300,
}, score, category) {
    if (!id || !label || !ALLOWED_ACTION_TYPES.has(actionType)) return null;
    return {
        suggestion: {
            id,
            label,
            actionType,
            payload,
            source,
            reasonCode,
            requiresConsent,
            ttlSeconds,
        },
        score,
        category,
    };
}

function messageSuggestion(id, label, source, reasonCode, score, category, options = {}) {
    return approvedSuggestion({
        id,
        label,
        actionType: options.actionType || 'send_message',
        payload: options.payload || { message: options.message || label },
        source,
        reasonCode,
        requiresConsent: options.requiresConsent === true,
        ttlSeconds: options.ttlSeconds || 300,
    }, score, category);
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s/_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function resolvePageLocation(pageContext = {}) {
    const rawUrl = String(pageContext.url || pageContext.sourcePageUrl || '').trim();
    if (!rawUrl) return '';
    try {
        const parsed = new URL(rawUrl, 'https://context.invalid');
        // Classify only client routes. The production hostname itself contains
        // "booking" (example hostname) and must never imply booking intent.
        return normalizeText(`${parsed.pathname || '/'} ${parsed.hash || ''}`);
    } catch (error) {
        return normalizeText(rawUrl.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, ''));
    }
}

function resolvePageKind(pageContext = {}) {
    const location = resolvePageLocation(pageContext);
    if (pageContext.viewingRoomId || pageContext.roomId || /room-detail|chi-tiet-phong/.test(location)) {
        return 'room_detail';
    }
    if (/customer-coin|xu-panacea|reward|loyalty/.test(location)) return 'xu_history';
    if (pageContext.bookingId || /customer-booking|booking-history|my-booking|dat-cho-cua-toi/.test(location)) {
        return 'booking_history';
    }
    if (/booking|dat-phong|checkout/.test(location)) return 'booking_flow';
    return 'home';
}

function isGreeting(message) {
    return /^(hi|hello|hey|xin\s*ch[aà]o|ch[aà]o|alo|chào\s*bạn|chào\s*pana)\s*[!?.]*$/i
        .test(String(message || '').trim());
}

function hasIntent(routerOutput, intent) {
    if (!routerOutput) return false;
    if (Array.isArray(routerOutput.intents) && routerOutput.intents.includes(intent)) return true;
    return routerOutput.primary_intent === intent || routerOutput.intent === intent;
}

function addPageCandidates(candidates, pageKind) {
    if (pageKind === 'room_detail') {
        candidates.push(
            messageSuggestion('room.check_availability', 'Phòng này còn giờ nào?', 'page_context', 'viewing_room', 72, 'availability'),
            messageSuggestion('room.compare_similar', 'So sánh phòng tương tự', 'page_context', 'viewing_room', 66, 'comparison'),
            messageSuggestion('room.view_offers', 'Ưu đãi áp dụng', 'page_context', 'viewing_room', 61, 'offers')
        );
        return;
    }

    if (pageKind === 'xu_history') {
        candidates.push(
            messageSuggestion('rewards.use_coins', 'Xu của tôi dùng được gì?', 'page_context', 'viewing_rewards', 72, 'rewards_use'),
            messageSuggestion('rewards.view_history', 'Xem lịch sử +/− Xu', 'page_context', 'viewing_rewards', 68, 'rewards_history', {
                actionType: 'view_reward_history',
                payload: { path: '/customer-coin' },
            }),
            messageSuggestion('rewards.view_tier', 'Xem quyền lợi hạng', 'page_context', 'viewing_rewards', 62, 'membership')
        );
        return;
    }

    if (pageKind === 'booking_history') {
        candidates.push(
            messageSuggestion('booking.view_upcoming', 'Xem lịch sắp tới', 'page_context', 'viewing_bookings', 72, 'booking_view', {
                actionType: 'open_booking',
                payload: { destination: 'upcoming' },
            }),
            messageSuggestion('booking.change_policy', 'Đổi hoặc hủy lịch', 'page_context', 'viewing_bookings', 66, 'booking_change'),
            messageSuggestion('booking.get_directions', 'Chỉ đường đến cơ sở', 'page_context', 'viewing_bookings', 60, 'directions')
        );
        return;
    }

    if (pageKind === 'booking_flow') {
        candidates.push(
            messageSuggestion('booking.select_today', 'Hôm nay', 'page_context', 'booking_flow', 70, 'booking_date'),
            messageSuggestion('booking.select_weekend', 'Cuối tuần này', 'page_context', 'booking_flow', 66, 'booking_date_alt'),
            messageSuggestion('booking.select_other_date', 'Chọn ngày khác', 'page_context', 'booking_flow', 62, 'booking_date_picker', {
                actionType: 'open_date_picker',
                payload: {},
            })
        );
    }
}

function addBookingIntentCandidates(candidates, routerOutput = {}) {
    if (!hasIntent(routerOutput, 'booking')) return;
    const entities = routerOutput.entities || {};
    if (!entities.date) {
        candidates.push(messageSuggestion(
            'booking.select_date',
            'Chọn ngày đặt phòng',
            'current_intent',
            'booking_missing_date',
            100,
            'booking_date',
            { actionType: 'open_date_picker', payload: {} }
        ));
    }
    if (!entities.serviceType) {
        candidates.push(messageSuggestion(
            'booking.select_service',
            'Chọn dịch vụ phù hợp',
            'current_intent',
            'booking_missing_service',
            96,
            'booking_service'
        ));
    }
    if (!entities.branchId) {
        candidates.push(messageSuggestion(
            'booking.select_branch',
            'Chọn cơ sở gần bạn',
            'current_intent',
            'booking_missing_branch',
            92,
            'booking_branch'
        ));
    }
    if (!entities.guests) {
        candidates.push(messageSuggestion(
            'booking.select_guests',
            'Đi bao nhiêu người?',
            'current_intent',
            'booking_missing_guests',
            88,
            'booking_guests'
        ));
    }
}

function addPersonalizedCandidates(candidates, personalizationContext) {
    if (!personalizationContext || typeof personalizationContext !== 'object') return;
    const consent = personalizationContext.consent || {};
    const session = personalizationContext.sessionContext || {};
    const identity = personalizationContext.identity || {};
    const behavior = personalizationContext.behavioralSummary || {};

    if (consent.bookingAssistance === true && Number(session.activeBookingCount) > 0) {
        candidates.push(
            messageSuggestion('personal.booking_upcoming', 'Xem đặt chỗ sắp tới', 'consented_context', 'active_booking', 82, 'booking_view', {
                actionType: 'open_booking',
                payload: { destination: 'upcoming' },
                requiresConsent: true,
            }),
            messageSuggestion('personal.booking_change', 'Tôi muốn đổi lịch', 'consented_context', 'active_booking', 76, 'booking_change', {
                requiresConsent: true,
            })
        );
    }

    if (consent.profile === true && Number(identity.coinsBalance) > 0) {
        candidates.push(messageSuggestion(
            'personal.coins_use',
            'Xu của tôi dùng được gì?',
            'consented_context',
            'available_coins',
            54,
            'rewards_use',
            { requiresConsent: true }
        ));
    }

    const frequentRoomType = consent.bookingHistory === true && Array.isArray(behavior.frequentRoomTypes)
        ? behavior.frequentRoomTypes[0]
        : null;
    if (frequentRoomType) {
        candidates.push(messageSuggestion(
            'personal.repeat_service',
            `Xem lại ${String(frequentRoomType).toUpperCase()}`,
            'consented_context',
            'frequent_service',
            51,
            'repeat_service',
            { requiresConsent: true }
        ));
    }
}

function addMessageCandidates(candidates, userMessage, botReply) {
    const message = normalizeText(userMessage);
    const reply = normalizeText(botReply);

    if (isGreeting(userMessage)) {
        candidates.push(
            messageSuggestion('general.find_service', 'Tìm dịch vụ phù hợp', 'current_intent', 'greeting', 80, 'discover'),
            messageSuggestion('general.price_and_slots', 'Xem giá và lịch trống', 'current_intent', 'greeting', 75, 'pricing'),
            messageSuggestion('general.current_offers', 'Ưu đãi đang có', 'current_intent', 'greeting', 70, 'offers')
        );
        return;
    }

    if (/gia|bang gia|chi phi|bao nhieu/.test(message)) {
        candidates.push(
            messageSuggestion('pricing.view_slots', 'Xem giá và lịch trống', 'current_intent', 'pricing_question', 86, 'pricing'),
            messageSuggestion('pricing.view_offers', 'Xem ưu đãi hiện có', 'current_intent', 'pricing_question', 78, 'offers'),
            messageSuggestion('pricing.start_booking', 'Đặt lịch trải nghiệm', 'current_intent', 'pricing_question', 74, 'booking_start')
        );
    }

    if (/vuon|catharsis|oasis|genii|mutiny/.test(message) || /vuon|catharsis|oasis|genii|mutiny/.test(reply)) {
        candidates.push(
            messageSuggestion('service.compare_gardens', 'So sánh các khu vườn', 'current_intent', 'garden_question', 82, 'comparison'),
            messageSuggestion('service.view_price', 'Xem bảng giá', 'current_intent', 'garden_question', 76, 'pricing'),
            messageSuggestion('service.start_booking', 'Đặt lịch ngay', 'current_intent', 'garden_question', 72, 'booking_start')
        );
    }

    if (/workshop|dan len|nen|banh|trang suc/.test(message)) {
        candidates.push(
            messageSuggestion('workshop.schedule', 'Lịch workshop tuần này', 'current_intent', 'workshop_question', 84, 'availability'),
            messageSuggestion('workshop.book', 'Đặt chỗ workshop', 'current_intent', 'workshop_question', 78, 'booking_start'),
            messageSuggestion('workshop.price', 'Giá workshop bao nhiêu?', 'current_intent', 'workshop_question', 72, 'pricing')
        );
    }

    if (/thanh vien|diem|xu|voucher|uu dai/.test(message)) {
        candidates.push(
            messageSuggestion('rewards.earn', 'Cách tích Xu', 'current_intent', 'rewards_question', 84, 'rewards_earn'),
            messageSuggestion('rewards.use', 'Đổi Xu lấy ưu đãi', 'current_intent', 'rewards_question', 78, 'rewards_use'),
            messageSuggestion('rewards.tiers', 'Các hạng thành viên', 'current_intent', 'rewards_question', 72, 'membership')
        );
    }
}

function addGenericCandidates(candidates) {
    candidates.push(
        messageSuggestion('general.find_service', 'Tìm dịch vụ phù hợp', 'generic_fallback', 'fallback', 20, 'discover'),
        messageSuggestion('general.price_and_slots', 'Xem giá và lịch trống', 'generic_fallback', 'fallback', 18, 'pricing'),
        messageSuggestion('general.current_offers', 'Ưu đãi đang có', 'generic_fallback', 'fallback', 16, 'offers')
    );
}

function supportOnlySuggestions() {
    return [
        messageSuggestion('support.tell_more', 'Kể thêm cho Pana nghe', 'current_turn', 'emotional_support', 100, 'support'),
        messageSuggestion('support.counseling', 'Tìm hiểu tham vấn 1:1', 'current_turn', 'emotional_support', 95, 'counseling'),
        messageSuggestion('support.handoff', 'Gặp tư vấn viên', 'current_turn', 'emotional_support', 90, 'handoff', {
            actionType: 'handoff',
            payload: {},
            ttlSeconds: 120,
        })
    ];
}

function finalizeCandidates(candidates, recentSuggestionIds = []) {
    const recent = new Set(Array.isArray(recentSuggestionIds) ? recentSuggestionIds.map(String) : []);
    const byId = new Map();

    for (const candidate of candidates.filter(Boolean)) {
        const id = candidate.suggestion.id;
        const adjusted = {
            ...candidate,
            score: candidate.score - (recent.has(id) ? 40 : 0),
        };
        const existing = byId.get(id);
        if (!existing || adjusted.score > existing.score) byId.set(id, adjusted);
    }

    const selected = [];
    const categories = new Set();
    for (const candidate of [...byId.values()].sort((a, b) => b.score - a.score)) {
        if (categories.has(candidate.category)) continue;
        selected.push(candidate.suggestion);
        categories.add(candidate.category);
        if (selected.length >= MAX_SUGGESTIONS) break;
    }
    return selected;
}

function toLegacyQuickReplies(suggestions) {
    return (Array.isArray(suggestions) ? suggestions : [])
        .map((item) => String(item?.label || '').trim())
        .filter(Boolean)
        .slice(0, MAX_SUGGESTIONS);
}

/**
 * @returns {{suggestions: Object[], quickReplies: string[]}}
 */
function generateSuggestionSet({
    stage = 'post_reply',
    botReply = '',
    userMessage = '',
    emotionState = null,
    conversationStatus = 'bot_active',
    routerOutput = null,
    pageContext = null,
    personalizationContext = null,
    safetyResult = null,
    recentSuggestionIds = [],
} = {}) {
    if (conversationStatus === 'human_active' || conversationStatus === 'queued_human') {
        return { suggestions: [], quickReplies: [] };
    }

    const isSafetyFlow = conversationStatus === 'safety_escalated'
        || safetyResult?.critical === true
        || Number(safetyResult?.distress_score) >= 3;
    if (isSafetyFlow || emotionState?.needsEmpathy) {
        const suggestions = finalizeCandidates(supportOnlySuggestions(), recentSuggestionIds);
        return { suggestions, quickReplies: toLegacyQuickReplies(suggestions) };
    }

    const candidates = [];
    addBookingIntentCandidates(candidates, routerOutput || {});
    addPageCandidates(candidates, resolvePageKind(pageContext || {}));
    addPersonalizedCandidates(candidates, personalizationContext);
    if (stage !== 'initial') addMessageCandidates(candidates, userMessage, botReply);
    addGenericCandidates(candidates);

    const suggestions = finalizeCandidates(candidates, recentSuggestionIds);
    return { suggestions, quickReplies: toLegacyQuickReplies(suggestions) };
}

/** Legacy compatibility for existing callers/tests. */
function generateQuickReplies(params) {
    return generateSuggestionSet(params).quickReplies;
}

module.exports = {
    ALLOWED_ACTION_TYPES,
    MAX_SUGGESTIONS,
    generateQuickReplies,
    generateSuggestionSet,
    resolvePageLocation,
    resolvePageKind,
    toLegacyQuickReplies,
};
