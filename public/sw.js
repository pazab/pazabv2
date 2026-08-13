// 파잡 Service Worker - 웹 푸시 수신

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

// 푸시 수신
self.addEventListener('push', (e) => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || '파잡 알림', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'pazab',
      data: { url: data.url || '/', ...(data.data || {}) },
      actions: data.actions || [],
      vibrate: [200, 100, 200],
    })
  );
});

// 알림 클릭 → 원탭 액션(출근/퇴근) 처리 또는 해당 URL 이동
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const notifData = e.notification.data || {};

  // 출근/퇴근 원탭 액션 버튼 클릭 — 앱을 열지 않고 서버에 바로 처리 요청
  if ((e.action === 'checkin' || e.action === 'checkout') && notifData.teamMemberId) {
    e.waitUntil(
      fetch('/api/attendance/quick-action', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamMemberId: notifData.teamMemberId, action: e.action }),
      })
        .then((res) => res.json())
        .then((result) => {
          const ok = !result.error;
          return self.registration.showNotification(
            ok ? (e.action === 'checkin' ? '✅ 출근 처리 완료' : '🔴 퇴근 처리 완료') : '⚠️ 처리 실패',
            {
              body: ok ? (result.message || `${result.time || ''} 처리됐어요.`) : (result.error || '다시 시도해주세요.'),
              icon: '/icon-192.png',
              tag: 'pazab-quick-action-result',
            }
          );
        })
        .catch(() =>
          self.registration.showNotification('⚠️ 처리 실패', {
            body: '네트워크 오류로 처리하지 못했어요. 앱에서 직접 시도해주세요.',
            icon: '/icon-192.png',
            tag: 'pazab-quick-action-result',
          })
        )
    );
    return;
  }

  // 대타 출근/퇴근/연장 원탭 액션 — matches 기준(팀원과 별도 엔드포인트)
  if ((e.action === 'daeta_checkin' || e.action === 'daeta_checkout' || e.action === 'daeta_extend') && notifData.matchId) {
    const endpoint = e.action === 'daeta_checkin' ? '/api/daeta/checkin' : e.action === 'daeta_checkout' ? '/api/daeta/checkout' : '/api/daeta/extend';
    const successTitle = e.action === 'daeta_checkin' ? '✅ 출근 처리 완료' : e.action === 'daeta_checkout' ? '🏁 퇴근 처리 완료' : '⏳ 10분 연장했어요';
    const successBody = e.action === 'daeta_checkin' ? '출근 처리됐어요.' : e.action === 'daeta_checkout' ? '퇴근 처리됐어요. 사장님이 정산할 거예요.' : '자동 노쇼 판정을 10분 미뤘어요.';
    e.waitUntil(
      fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: notifData.matchId }),
      })
        .then((res) => res.json())
        .then((result) => {
          const ok = !result.error;
          return self.registration.showNotification(
            ok ? successTitle : '⚠️ 처리 실패',
            {
              body: ok ? (result.message || successBody) : (result.error || '다시 시도해주세요.'),
              icon: '/icon-192.png',
              tag: 'pazab-quick-action-result',
            }
          );
        })
        .catch(() =>
          self.registration.showNotification('⚠️ 처리 실패', {
            body: '네트워크 오류로 처리하지 못했어요. 앱에서 직접 시도해주세요.',
            icon: '/icon-192.png',
            tag: 'pazab-quick-action-result',
          })
        )
    );
    return;
  }

  // 기본(본문 클릭) — 해당 URL로 이동
  const url = notifData.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
