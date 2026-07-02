const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === 1) {
        const mdArea = node.classList?.contains('markdown') ? node : node.querySelector('.markdown, .prose');
        if (mdArea) {
          scanAndFlag(mdArea);
        }
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

async function scanAndFlag(container) {
  if (container.getAttribute('data-truth-scanned') === 'true') return;
  container.setAttribute('data-truth-scanned', 'true');

  const doiPattern = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+(?:\([-A-Za-z0-9_]+\)|[-A-Za-z0-9_]+)+)\b/gi;
  const targets = container.querySelectorAll('p, li');
  
  for (const el of targets) {
    if (el.querySelector('.truth-badge')) continue;

    const text = el.innerText;
    const doiMatch = text.match(doiPattern);
    
    if (doiMatch) {
      const doi = doiMatch[0];
      
      const badge = document.createElement('span');
      badge.className = 'truth-badge loading';
      badge.innerText = ' ● ';
      badge.style.marginLeft = '8px';
      badge.style.cursor = 'help';
      el.appendChild(badge);

      const cleanTitle = text.replace(doiPattern, '').replace(/[\[\]\(\)\-\:\d]/g, '').trim().substring(0, 60);

      const res = await chrome.runtime.sendMessage({
        type: "CHECK_CITATION",
        data: { doi: doi, title: cleanTitle || null }
      });

      badge.className = `truth-badge ${res.status.toLowerCase()}`;
      badge.innerText = ` ● [${res.status}] `;
      badge.title = `Status: ${res.status}\nReason: ${res.reason}`;
      
      if ((res.status === 'RED' || res.status === 'YELLOW') && res.suggestion) {
        const fix = document.createElement('div');
        fix.className = 'fix-suggestion';
        fix.style.marginTop = '6px';
        fix.style.padding = '8px';
        fix.style.borderLeft = '3px solid #e53e3e';
        fix.style.backgroundColor = '#fff5f5';
        fix.style.fontSize = '12px';
        
        fix.innerHTML = `
          <span style="color: #e53e3e; font-weight: bold;">💡 Suggested Real Paper:</span><br>
          <b>${res.suggestion.title}</b> (${res.suggestion.year})<br>
          <span style="font-size: 11px; color: #718096;">Author: ${res.suggestion.author} ${res.suggestion.doi ? `| DOI: ${res.suggestion.doi}` : ''}</span>
        `;
        el.appendChild(fix);
      }
    }
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_CURRENT_STATS") {
    const greens = document.querySelectorAll('.truth-badge.green');
    const reds = document.querySelectorAll('.truth-badge.red');
    const yellows = document.querySelectorAll('.truth-badge.yellow');

    const verifiedPapers = [];
    greens.forEach(badge => {
      const text = badge.parentElement ? badge.parentElement.innerText : "Verified Paper";
      verifiedPapers.push({
        title: text.split('●')[0].trim().substring(0, 100)
      });
    });

    sendResponse({
      greenCount: greens.length,
      redCount: reds.length,
      yellowCount: yellows.length,
      verifiedPapers: verifiedPapers
    });
  }
  return true;
});
