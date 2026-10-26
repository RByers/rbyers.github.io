'use strict';

(function() {
  // State
  const openedWindows = [];
  let nextWindowId = 1;
  let incomingMessageCount = 0;

  // DOM Elements
  const viewportSizeEl = document.getElementById('viewport-size');
  const openerSection = document.getElementById('opener-section');
  const openerStatusBadge = document.getElementById('opener-status-badge');
  const openerDetails = document.getElementById('opener-details');
  const openerMessageForm = document.getElementById('opener-message-form');
  const openerMessageInput = document.getElementById('opener-message-input');
  const pingOpenerBtn = document.getElementById('ping-opener-btn');
  const closeSelfBtn = document.getElementById('close-self-btn');

  const configForm = document.getElementById('split-config-form');
  const urlInput = document.getElementById('url-input');
  const splitPositionSelect = document.getElementById('split-position-select');
  const useSplitSizeCheckbox = document.getElementById('use-split-size');
  const sizeControlContainer = document.getElementById('size-control-container');
  const splitSizeRange = document.getElementById('split-size-range');
  const splitSizeNumber = document.getElementById('split-size-number');
  const targetInput = document.getElementById('target-input');
  const flagSplit = document.getElementById('flag-split');
  const flagPopup0 = document.getElementById('flag-popup0');
  const flagPopup = document.getElementById('flag-popup');
  const flagNoopener = document.getElementById('flag-noopener');
  const flagNoreferrer = document.getElementById('flag-noreferrer');
  const extraFeaturesInput = document.getElementById('extra-features-input');
  const generatedCallPreview = document.getElementById('generated-call-preview');

  const declarativeRelOpener = document.getElementById('declarative-rel-opener');
  const declarativeLink = document.getElementById('declarative-link');
  const declarativeCodePreview = document.getElementById('declarative-code-preview');

  const windowsCountBadge = document.getElementById('windows-count-badge');
  const closeAllWindowsBtn = document.getElementById('close-all-windows-btn');
  const broadcastForm = document.getElementById('broadcast-form');
  const broadcastInput = document.getElementById('broadcast-input');
  const openedWindowsList = document.getElementById('opened-windows-list');
  const noWindowsMsg = document.getElementById('no-windows-msg');

  const messagesCountBadge = document.getElementById('messages-count-badge');
  const clearMessagesBtn = document.getElementById('clear-messages-btn');
  const incomingMessagesList = document.getElementById('incoming-messages-list');
  const noMessagesMsg = document.getElementById('no-messages-msg');

  // Initialize default URL to current page for easy back-and-forth split demo
  urlInput.value = window.location.href;

  function formatTime(date) {
    return date.toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatPayload(data) {
    if (typeof data === 'string') {
      return data;
    }
    try {
      return JSON.stringify(data, null, 2);
    } catch (err) {
      return String(data);
    }
  }

  // Update viewport dimensions display
  function updateViewportInfo() {
    viewportSizeEl.textContent =
      window.innerWidth + '×' + window.innerHeight +
      ' (outer: ' + window.outerWidth + '×' + window.outerHeight + ')';
  }

  // Check and render window.opener status
  function updateOpenerStatus() {
    let hasOpener = false;
    let openerClosed = false;
    try {
      hasOpener = Boolean(window.opener);
      if (hasOpener) {
        openerClosed = Boolean(window.opener.closed);
      }
    } catch (err) {
      hasOpener = true;
    }

    if (hasOpener && !openerClosed) {
      openerSection.classList.add('active-opener');
      openerStatusBadge.textContent = 'Connected';
      openerStatusBadge.className = 'badge badge-success';

      let originInfo = 'Cross-origin or restricted';
      try {
        if (window.opener.location && window.opener.location.href) {
          originInfo = window.opener.location.href;
        }
      } catch (err) {
        // Cross-origin access to location.href throws SecurityError; expected
      }
      openerDetails.textContent = 'Opener URL: ' + originInfo;
      openerMessageForm.hidden = false;
    } else if (hasOpener && openerClosed) {
      openerSection.classList.remove('active-opener');
      openerStatusBadge.textContent = 'Opener Closed';
      openerStatusBadge.className = 'badge badge-warning';
      openerDetails.textContent = 'window.opener was set, but that window has been closed.';
      openerMessageForm.hidden = true;
    } else {
      openerSection.classList.remove('active-opener');
      openerStatusBadge.textContent = 'None (null)';
      openerStatusBadge.className = 'badge badge-neutral';
      openerDetails.textContent =
        'window.opener is null. Open this page from the form below (without noopener) to test communicating back to window.opener.';
      openerMessageForm.hidden = true;
    }
  }

  // Build windowFeatures string from current form controls
  function buildWindowFeatures() {
    const features = [];

    if (flagPopup0.checked) {
      features.push('popup=0');
    }
    if (flagSplit.checked) {
      features.push('split');
    }
    if (flagPopup.checked) {
      features.push('popup');
    }

    const pos = splitPositionSelect.value.trim();
    if (pos) {
      features.push('splitposition=' + pos);
    }

    if (useSplitSizeCheckbox.checked) {
      const sizeVal = splitSizeNumber.value.trim();
      if (sizeVal !== '') {
        features.push('splitsize=' + sizeVal);
      }
    }

    if (flagNoopener.checked) {
      features.push('noopener');
    }
    if (flagNoreferrer.checked) {
      features.push('noreferrer');
    }

    const extra = extraFeaturesInput.value.trim();
    if (extra) {
      features.push(extra);
    }

    return features.join(',');
  }

  // Update the live code preview and declarative link
  function updatePreviews() {
    const url = urlInput.value.trim() || window.location.href;
    const target = targetInput.value;
    const features = buildWindowFeatures();

    generatedCallPreview.textContent =
      'window.open(' +
      JSON.stringify(url) + ', ' +
      JSON.stringify(target) + ', ' +
      JSON.stringify(features) + ')';

    // Update declarative <a> element
    declarativeLink.setAttribute('href', url);
    declarativeLink.setAttribute('target', target);
    if (features) {
      declarativeLink.setAttribute('windowfeatures', features);
    } else {
      declarativeLink.removeAttribute('windowfeatures');
    }

    if (declarativeRelOpener.checked) {
      declarativeLink.setAttribute('rel', 'opener');
    } else {
      declarativeLink.removeAttribute('rel');
    }

    const relAttr = declarativeRelOpener.checked ? ' rel="opener"' : '';
    const wfAttr = features ? ' windowfeatures="' + features + '"' : '';
    declarativeCodePreview.textContent =
      '<a href="' + url + '" target="' + target + '"' + relAttr + wfAttr + '>...</a>';
  }

  // Find or register a window entry
  function findWindowEntryByRef(winRef) {
    if (!winRef) {
      return null;
    }
    for (let i = 0; i < openedWindows.length; i++) {
      if (openedWindows[i].ref === winRef) {
        return openedWindows[i];
      }
    }
    return null;
  }

  // Append a message event to a specific window entry's log and re-render its list
  function appendWindowEventLog(entry, direction, text) {
    entry.events.push({
      direction: direction, // 'in' | 'out'
      text: text,
      time: formatTime(new Date()),
    });
    if (entry.eventsListEl) {
      renderWindowEntryEvents(entry);
    }
  }

  function renderWindowEntryEvents(entry) {
    const listEl = entry.eventsListEl;
    if (!listEl) {
      return;
    }
    listEl.replaceChildren();

    if (entry.events.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'window-event-entry';
      emptyLi.textContent = 'No messages exchanged yet.';
      listEl.appendChild(emptyLi);
      return;
    }

    entry.events.forEach(function(ev) {
      const li = document.createElement('li');
      li.className =
        'window-event-entry ' +
        (ev.direction === 'in' ? 'window-event-in' : 'window-event-out');
      const prefix = ev.direction === 'in' ? '← Received' : '→ Sent';
      li.textContent = '[' + ev.time + '] ' + prefix + ': ' + ev.text;
      listEl.appendChild(li);
    });
    listEl.scrollTop = listEl.scrollHeight;
  }

  // Close and remove a single opened window entry
  function closeAndRemoveWindow(entryId) {
    const idx = openedWindows.findIndex(function(item) {
      return item.id === entryId;
    });
    if (idx === -1) {
      return;
    }
    const entry = openedWindows[idx];
    try {
      if (entry.ref && !entry.ref.closed) {
        entry.ref.close();
      }
    } catch (err) {
      // Ignore errors if already closed or cross-origin restricted
    }
    openedWindows.splice(idx, 1);
    renderOpenedWindows();
  }

  // Send postMessage to an opened window entry
  function sendToWindowEntry(entry, messageText) {
    if (!entry.ref || entry.ref.closed) {
      updateOpenedWindowsLiveStatus();
      return;
    }
    try {
      entry.ref.postMessage(messageText, '*');
      appendWindowEventLog(entry, 'out', messageText);
    } catch (err) {
      appendWindowEventLog(entry, 'out', 'Error sending message: ' + String(err));
    }
  }

  // Render the list of opened windows
  function renderOpenedWindows() {
    windowsCountBadge.textContent = String(openedWindows.length);
    closeAllWindowsBtn.disabled = openedWindows.length === 0;
    broadcastForm.hidden = openedWindows.length === 0;

    openedWindowsList.replaceChildren();

    if (openedWindows.length === 0) {
      openedWindowsList.appendChild(noWindowsMsg);
      return;
    }

    openedWindows.forEach(function(entry) {
      const itemEl = document.createElement('div');
      itemEl.className = 'window-item';
      entry.itemEl = itemEl;

      // Header row
      const headerEl = document.createElement('div');
      headerEl.className = 'window-item-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'window-title-group';

      const idSpan = document.createElement('span');
      idSpan.className = 'window-id';
      idSpan.textContent = 'Window #' + entry.id;

      const statusBadge = document.createElement('span');
      entry.statusBadgeEl = statusBadge;

      titleGroup.appendChild(idSpan);
      titleGroup.appendChild(statusBadge);

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn btn-danger btn-sm';
      closeBtn.textContent = 'Close & Remove';
      closeBtn.addEventListener('click', function() {
        closeAndRemoveWindow(entry.id);
      });

      headerEl.appendChild(titleGroup);
      headerEl.appendChild(closeBtn);

      // Metadata section
      const metaEl = document.createElement('div');
      metaEl.className = 'window-meta';

      const urlLine = document.createElement('div');
      urlLine.textContent = 'URL: ' + entry.url;

      const featuresLine = document.createElement('div');
      featuresLine.textContent =
        'windowFeatures: ' + (entry.features ? '"' + entry.features + '"' : '(empty)');

      const sizeLine = document.createElement('div');
      entry.sizeLineEl = sizeLine;

      metaEl.appendChild(urlLine);
      metaEl.appendChild(featuresLine);
      metaEl.appendChild(sizeLine);

      // postMessage form for this window
      const msgForm = document.createElement('form');
      msgForm.className = 'window-controls';

      const msgInput = document.createElement('input');
      msgInput.type = 'text';
      msgInput.placeholder = 'Message to Window #' + entry.id + '...';
      msgInput.value = 'Ping from opener to Window #' + entry.id;
      msgInput.required = true;
      entry.msgInputEl = msgInput;

      const sendBtn = document.createElement('button');
      sendBtn.type = 'submit';
      sendBtn.className = 'btn btn-primary btn-sm';
      sendBtn.textContent = 'postMessage';
      entry.sendBtnEl = sendBtn;

      msgForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const text = msgInput.value.trim();
        if (!text) {
          return;
        }
        sendToWindowEntry(entry, text);
      });

      msgForm.appendChild(msgInput);
      msgForm.appendChild(sendBtn);

      // Per-window message events view
      const eventsBox = document.createElement('div');
      eventsBox.className = 'window-events-box';

      const eventsTitle = document.createElement('div');
      eventsTitle.className = 'window-events-title';
      eventsTitle.textContent = 'Window #' + entry.id + ' Message Events';

      const eventsList = document.createElement('ul');
      eventsList.className = 'window-events-list';
      entry.eventsListEl = eventsList;

      eventsBox.appendChild(eventsTitle);
      eventsBox.appendChild(eventsList);

      itemEl.appendChild(headerEl);
      itemEl.appendChild(metaEl);
      itemEl.appendChild(msgForm);
      itemEl.appendChild(eventsBox);

      openedWindowsList.appendChild(itemEl);

      renderWindowEntryEvents(entry);
    });

    updateOpenedWindowsLiveStatus();
  }

  // Update open/closed status and live viewport size of opened windows
  function updateOpenedWindowsLiveStatus() {
    openedWindows.forEach(function(entry) {
      let isClosed = false;
      try {
        isClosed = !entry.ref || Boolean(entry.ref.closed);
      } catch (err) {
        isClosed = false;
      }

      if (entry.statusBadgeEl) {
        if (!entry.ref) {
          entry.statusBadgeEl.textContent = 'No Handle (noopener / blocked)';
          entry.statusBadgeEl.className = 'badge badge-warning';
        } else if (isClosed) {
          entry.statusBadgeEl.textContent = 'Closed';
          entry.statusBadgeEl.className = 'badge badge-neutral';
        } else {
          entry.statusBadgeEl.textContent = 'Open';
          entry.statusBadgeEl.className = 'badge badge-success';
        }
      }

      if (entry.itemEl) {
        entry.itemEl.classList.toggle('window-closed', isClosed || !entry.ref);
      }
      if (entry.sendBtnEl) {
        entry.sendBtnEl.disabled = isClosed || !entry.ref;
      }
      if (entry.msgInputEl) {
        entry.msgInputEl.disabled = isClosed || !entry.ref;
      }

      if (entry.sizeLineEl) {
        if (entry.ref && !isClosed) {
          try {
            const w = entry.ref.innerWidth;
            const h = entry.ref.innerHeight;
            if (typeof w === 'number' && typeof h === 'number') {
              entry.sizeLineEl.textContent =
                'Opened at ' + entry.openedAt + ' • Live Viewport: ' + w + '×' + h;
            } else {
              entry.sizeLineEl.textContent = 'Opened at ' + entry.openedAt;
            }
          } catch (err) {
            entry.sizeLineEl.textContent =
              'Opened at ' + entry.openedAt + ' • (Cross-origin viewport)';
          }
        } else {
          entry.sizeLineEl.textContent = 'Opened at ' + entry.openedAt;
        }
      }
    });
  }

  // Identify the source of a message event
  function describeMessageSource(sourceWindow) {
    if (!sourceWindow) {
      return 'Unknown source (null)';
    }
    try {
      if (window.opener && sourceWindow === window.opener) {
        return 'window.opener';
      }
    } catch (err) {
      // Ignore comparison errors if any
    }

    const existingEntry = findWindowEntryByRef(sourceWindow);
    if (existingEntry) {
      return 'Window #' + existingEntry.id;
    }

    if (sourceWindow === window) {
      return 'Same Window (self)';
    }

    // If a child window was opened via declarative <a rel="opener" windowfeatures="...">
    // and sent us a message, register it in our opened windows list so user can manage it!
    const autoEntry = {
      id: nextWindowId++,
      ref: sourceWindow,
      url: '(Discovered via postMessage)',
      target: '_blank',
      features: '(declarative or external)',
      openedAt: formatTime(new Date()),
      events: [],
    };
    openedWindows.push(autoEntry);
    renderOpenedWindows();
    return 'Window #' + autoEntry.id + ' (discovered)';
  }

  // Record an incoming message event in the UI
  function handleIncomingMessage(event) {
    incomingMessageCount++;
    messagesCountBadge.textContent = String(incomingMessageCount);

    if (noMessagesMsg.parentNode === incomingMessagesList) {
      incomingMessagesList.removeChild(noMessagesMsg);
    }

    const senderLabel = describeMessageSource(event.source);
    const payloadStr = formatPayload(event.data);
    const timeStr = formatTime(new Date());

    // Also log on the specific opened window card if applicable
    const matchedEntry = findWindowEntryByRef(event.source);
    if (matchedEntry) {
      appendWindowEventLog(matchedEntry, 'in', payloadStr);
    }

    // Build message card in Incoming Message Events log
    const card = document.createElement('div');
    card.className = 'message-card';

    const header = document.createElement('div');
    header.className = 'message-card-header';

    const senderSpan = document.createElement('span');
    senderSpan.className = 'message-sender';
    senderSpan.textContent = 'From: ' + senderLabel;

    const metaSpan = document.createElement('span');
    metaSpan.textContent = 'Origin: ' + (event.origin || 'null') + ' • ' + timeStr;

    header.appendChild(senderSpan);
    header.appendChild(metaSpan);

    const payloadBox = document.createElement('div');
    payloadBox.className = 'message-payload';
    payloadBox.textContent = payloadStr;

    card.appendChild(header);
    card.appendChild(payloadBox);

    // Reply form if event.source is available
    if (event.source) {
      const replyForm = document.createElement('form');
      replyForm.className = 'message-reply-form';

      const replyInput = document.createElement('input');
      replyInput.type = 'text';
      replyInput.placeholder = 'Reply to ' + senderLabel + '...';
      replyInput.value = 'Ack: ' + payloadStr;
      replyInput.required = true;

      const replyBtn = document.createElement('button');
      replyBtn.type = 'submit';
      replyBtn.className = 'btn btn-secondary btn-sm';
      replyBtn.textContent = 'Reply';

      replyForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const replyText = replyInput.value.trim();
        if (!replyText) {
          return;
        }
        try {
          const targetOrigin =
            event.origin && event.origin !== 'null' ? event.origin : '*';
          event.source.postMessage(replyText, targetOrigin);
          if (matchedEntry) {
            appendWindowEventLog(matchedEntry, 'out', replyText);
          }
          replyBtn.textContent = 'Sent!';
          setTimeout(function() {
            replyBtn.textContent = 'Reply';
          }, 1200);
        } catch (err) {
          replyBtn.textContent = 'Failed';
        }
      });

      replyForm.appendChild(replyInput);
      replyForm.appendChild(replyBtn);
      card.appendChild(replyForm);
    }

    // Prepend newest message at the top
    incomingMessagesList.insertBefore(card, incomingMessagesList.firstChild);
  }

  // Event Listeners: Form controls synchronization
  splitSizeRange.addEventListener('input', function() {
    splitSizeNumber.value = splitSizeRange.value;
    updatePreviews();
  });

  splitSizeNumber.addEventListener('input', function() {
    const val = parseInt(splitSizeNumber.value, 10);
    if (!Number.isNaN(val)) {
      const clamped = Math.max(1, Math.min(99, val));
      splitSizeRange.value = String(clamped);
    }
    updatePreviews();
  });

  useSplitSizeCheckbox.addEventListener('change', function() {
    const enabled = useSplitSizeCheckbox.checked;
    sizeControlContainer.classList.toggle('disabled', !enabled);
    splitSizeRange.disabled = !enabled;
    splitSizeNumber.disabled = !enabled;
    updatePreviews();
  });

  [
    urlInput,
    splitPositionSelect,
    targetInput,
    flagSplit,
    flagPopup0,
    flagPopup,
    flagNoopener,
    flagNoreferrer,
    extraFeaturesInput,
    declarativeRelOpener,
  ].forEach(function(el) {
    el.addEventListener('input', updatePreviews);
    el.addEventListener('change', updatePreviews);
  });

  // URL Presets
  document.querySelectorAll('[data-url-preset]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const preset = btn.getAttribute('data-url-preset');
      if (preset === 'self') {
        urlInput.value = window.location.href;
      } else {
        urlInput.value = preset;
      }
      updatePreviews();
    });
  });

  // Form submission: Open window via window.open()
  configForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const url = urlInput.value.trim() || window.location.href;
    const target = targetInput.value;
    const features = buildWindowFeatures();

    const winRef = window.open(url, target, features);

    const entry = {
      id: nextWindowId++,
      ref: winRef,
      url: url,
      target: target,
      features: features,
      openedAt: formatTime(new Date()),
      events: [],
    };
    openedWindows.push(entry);
    renderOpenedWindows();
  });

  // Send message to window.opener
  openerMessageForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!window.opener || window.opener.closed) {
      updateOpenerStatus();
      return;
    }
    const text = openerMessageInput.value.trim();
    if (!text) {
      return;
    }
    window.opener.postMessage(text, '*');
  });

  pingOpenerBtn.addEventListener('click', function() {
    if (!window.opener || window.opener.closed) {
      updateOpenerStatus();
      return;
    }
    const msg =
      'Split tab viewport is ' +
      window.innerWidth + '×' + window.innerHeight +
      ' (outer: ' + window.outerWidth + '×' + window.outerHeight + ')';
    window.opener.postMessage(msg, '*');
  });

  closeSelfBtn.addEventListener('click', function() {
    window.close();
  });

  // Close all opened windows
  closeAllWindowsBtn.addEventListener('click', function() {
    openedWindows.forEach(function(entry) {
      try {
        if (entry.ref && !entry.ref.closed) {
          entry.ref.close();
        }
      } catch (err) {
        // Ignore
      }
    });
    openedWindows.length = 0;
    renderOpenedWindows();
  });

  // Broadcast to all opened windows
  broadcastForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const text = broadcastInput.value.trim();
    if (!text) {
      return;
    }
    openedWindows.forEach(function(entry) {
      if (entry.ref && !entry.ref.closed) {
        sendToWindowEntry(entry, text);
      }
    });
  });

  // Clear incoming messages log
  clearMessagesBtn.addEventListener('click', function() {
    incomingMessageCount = 0;
    messagesCountBadge.textContent = '0';
    incomingMessagesList.replaceChildren(noMessagesMsg);
  });

  // Global message listener
  window.addEventListener('message', handleIncomingMessage);

  // Resize listener for live viewport dimensions
  window.addEventListener('resize', function() {
    updateViewportInfo();
    updateOpenedWindowsLiveStatus();
  });

  // Periodic poll to detect closed windows or closed opener and update viewport sizes
  setInterval(function() {
    updateOpenerStatus();
    updateOpenedWindowsLiveStatus();
  }, 1000);

  // Initial render
  updateViewportInfo();
  updateOpenerStatus();
  updatePreviews();
})();
