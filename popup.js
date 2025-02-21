let db;
const dbName = "journalDB";
let currentEditingTimestamp = null; // For journal edit mode
let currentEditingPlannerId = null;   // For planner edit mode

// Open (or create) the IndexedDB database with version 3
const request = indexedDB.open(dbName, 3);

request.onupgradeneeded = function (event) {
  db = event.target.result;
  if (!db.objectStoreNames.contains("entries")) {
    db.createObjectStore("entries", { keyPath: "timestamp" });
  }
  if (!db.objectStoreNames.contains("planner")) {
    db.createObjectStore("planner", { keyPath: "id", autoIncrement: true });
  }
};

request.onsuccess = function (event) {
  db = event.target.result;
  loadEntries();
  loadPlannerItems();
};

request.onerror = function (event) {
  console.error("Database error: " + event.target.errorCode);
};

/* ========================= Journal Functions ========================= */

function addEntry(text) {
  const timestamp = new Date().toISOString();
  const transaction = db.transaction(["entries"], "readwrite");
  const store = transaction.objectStore("entries");
  const entry = { timestamp, text };
  store.add(entry).onsuccess = loadEntries;
}

function updateEntry(timestamp, newText) {
  const transaction = db.transaction(["entries"], "readwrite");
  const store = transaction.objectStore("entries");
  const entry = { timestamp, text: newText };
  store.put(entry).onsuccess = function () {
    loadEntries();
    currentEditingTimestamp = null;
    document.getElementById("submitBtn").title = "Submit Entry";
    document.getElementById("cancelEditBtn").style.display = "none";
    document.getElementById("journalText").value = "";
  };
}

function deleteEntry(timestamp) {
  const transaction = db.transaction(["entries"], "readwrite");
  const store = transaction.objectStore("entries");
  store.delete(timestamp).onsuccess = loadEntries;
}

function displayEntries(entries) {
  const entriesDiv = document.getElementById("entries");
  entriesDiv.innerHTML = "";
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  entries.forEach(entry => {
    const div = document.createElement("div");
    div.className = "entry";
    
    const dateSpan = document.createElement("div");
    dateSpan.className = "timestamp";
    dateSpan.textContent = formatTimestamp(entry.timestamp);
    
    const textDiv = document.createElement("div");
    textDiv.textContent = entry.text;
    
    const btnContainer = document.createElement("div");
    btnContainer.style.display = "flex";
    btnContainer.style.flexDirection = "row";
    btnContainer.className = "crud-buttons";
    
    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.title = "Edit Entry";
    editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.004 1.004 0 000-1.42l-2.34-2.34a1.004 1.004 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>`;
    editBtn.addEventListener("click", () => {
      document.getElementById("journalText").value = entry.text;
      currentEditingTimestamp = entry.timestamp;
      document.getElementById("submitBtn").title = "Update Entry";
      document.getElementById("cancelEditBtn").style.display = "inline-block";
    });
    btnContainer.appendChild(editBtn);
    
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.title = "Delete Entry";
    deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-4.5l-1-1z"/></svg>`;
    deleteBtn.addEventListener("click", () => {
      if (confirm("Delete this entry?")) {
        deleteEntry(entry.timestamp);
      }
    });
    btnContainer.appendChild(deleteBtn);
    
    div.appendChild(dateSpan);
    div.appendChild(textDiv);
    div.appendChild(btnContainer);
    entriesDiv.appendChild(div);
  });
}

function loadEntries() {
  const transaction = db.transaction(["entries"], "readonly");
  const store = transaction.objectStore("entries");
  let allEntries = [];
  store.openCursor().onsuccess = function (event) {
    const cursor = event.target.result;
    if (cursor) {
      allEntries.push(cursor.value);
      cursor.continue();
    } else {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      const todaysEntries = allEntries.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        return entryDate >= todayStart && entryDate < tomorrowStart;
      });
      displayEntries(todaysEntries);
    }
  };
}

function searchEntries(keyword, startDate, endDate) {
  const transaction = db.transaction(["entries"], "readonly");
  const store = transaction.objectStore("entries");
  let filteredEntries = [];
  store.openCursor().onsuccess = function (event) {
    const cursor = event.target.result;
    if (cursor) {
      const entry = cursor.value;
      let include = true;
      if (keyword && !entry.text.toLowerCase().includes(keyword.toLowerCase())) {
        include = false;
      }
      if (startDate) {
        const start = new Date(startDate);
        const entryDate = new Date(entry.timestamp);
        if (entryDate < start) include = false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        const entryDate = new Date(entry.timestamp);
        if (entryDate >= end) include = false;
      }
      if (include) filteredEntries.push(entry);
      cursor.continue();
    } else {
      displayEntries(filteredEntries);
    }
  };
}

function exportData() {
  const transaction = db.transaction(["entries"], "readonly");
  const store = transaction.objectStore("entries");
  let allEntries = [];
  store.openCursor().onsuccess = function (event) {
    const cursor = event.target.result;
    if (cursor) {
      allEntries.push(cursor.value);
      cursor.continue();
    } else {
      const dataStr = JSON.stringify(allEntries, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "journal_entries.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const importedEntries = JSON.parse(e.target.result);
      if (Array.isArray(importedEntries)) {
        const transaction = db.transaction(["entries"], "readwrite");
        const store = transaction.objectStore("entries");
        importedEntries.forEach(entry => {
          store.put(entry);
        });
        transaction.oncomplete = loadEntries;
        transaction.onerror = e => console.error("Import error", e);
      } else {
        console.error("Invalid data format");
      }
    } catch (err) {
      console.error("Error parsing JSON", err);
    }
  };
  reader.readAsText(file);
}

/* ========================= Advanced Planner Functions ========================= */

function addPlannerItem(text, time, priority) {
  const today = new Date().toISOString().split("T")[0];
  const transaction = db.transaction(["planner"], "readwrite");
  const store = transaction.objectStore("planner");
  const item = { text, date: today, time, priority, completed: false };
  store.add(item).onsuccess = loadPlannerItems;
}

function updatePlannerItem(id, newText, newTime, newPriority, completed) {
  const transaction = db.transaction(["planner"], "readwrite");
  const store = transaction.objectStore("planner");
  const req = store.get(id);
  req.onsuccess = function (event) {
    let item = event.target.result;
    if (item) {
      item.text = newText;
      item.time = newTime;
      item.priority = newPriority;
      item.completed = completed;
      store.put(item).onsuccess = loadPlannerItems;
    }
  };
}

function togglePlannerCompletion(id) {
  const transaction = db.transaction(["planner"], "readwrite");
  const store = transaction.objectStore("planner");
  const req = store.get(id);
  req.onsuccess = function (event) {
    let item = event.target.result;
    if (item) {
      item.completed = !item.completed;
      store.put(item).onsuccess = loadPlannerItems;
    }
  };
}

function deletePlannerItem(id) {
  const transaction = db.transaction(["planner"], "readwrite");
  const store = transaction.objectStore("planner");
  store.delete(id).onsuccess = loadPlannerItems;
}

function displayPlannerItems(items) {
  const plannerDiv = document.getElementById("plannerItems");
  plannerDiv.innerHTML = "";
  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "planner-item";
    // Highlight overdue if due time passed and not completed
    if (item.time) {
      const dueTime = new Date(item.date + "T" + item.time);
      if (dueTime < new Date() && !item.completed) {
        div.classList.add("overdue");
      }
    }
    const infoSpan = document.createElement("span");
    let infoText = item.text;
    if (item.time) {
      infoText += " (Due: " + item.time + ")";
    }
    infoText += " [" + item.priority + "]";
    infoSpan.textContent = infoText;
    if (item.completed) {
      infoSpan.style.textDecoration = "line-through";
      infoSpan.style.color = "#888";
    }
    div.appendChild(infoSpan);
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.flexDirection = "row";
    // Toggle Completion button
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "icon-btn";
    toggleBtn.title = item.completed ? "Undo" : "Mark as Done";
    toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12 3.41 13.41 9 19 21 7 19.59 5.59z"/></svg>`;
    toggleBtn.addEventListener("click", () => {
      togglePlannerCompletion(item.id);
    });
    buttonContainer.appendChild(toggleBtn);
    
    // Edit button
    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.title = "Edit Planner Item";
    editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.004 1.004 0 000-1.42l-2.34-2.34a1.004 1.004 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>`;
    editBtn.addEventListener("click", () => {
      document.getElementById("plannerText").value = item.text;
      document.getElementById("plannerTime").value = item.time || "";
      document.getElementById("plannerPriority").value = item.priority;
      currentEditingPlannerId = item.id;
      document.getElementById("addPlannerBtn").title = "Update Planner Item";
      document.getElementById("cancelPlannerEditBtn").style.display = "inline-block";
    });
    buttonContainer.appendChild(editBtn);
    
    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.title = "Delete Planner Item";
    deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-4.5l-1-1z"/></svg>`;
    deleteBtn.addEventListener("click", () => {
      if (confirm("Delete this planner item?")) {
        deletePlannerItem(item.id);
      }
    });
    buttonContainer.appendChild(deleteBtn);
    div.append(buttonContainer);
    plannerDiv.appendChild(div);
  });
}

function loadPlannerItems() {
  const today = new Date().toISOString().split("T")[0];
  const transaction = db.transaction(["planner"], "readonly");
  const store = transaction.objectStore("planner");
  let items = [];
  store.openCursor().onsuccess = function (event) {
    const cursor = event.target.result;
    if (cursor) {
      const item = cursor.value;
      if (item.date === today) {
        items.push(item);
      }
      cursor.continue();
    } else {
      displayPlannerItems(items);
    }
  };
}

/* ========================= Event Listeners ========================= */

// Journal event listeners
document.getElementById("submitBtn").addEventListener("click", () => {
  const textArea = document.getElementById("journalText");
  const text = textArea.value.trim();
  if (!text) return;
  if (currentEditingTimestamp) {
    updateEntry(currentEditingTimestamp, text);
  } else {
    addEntry(text);
    textArea.value = "";
  }
});

document.getElementById("cancelEditBtn").addEventListener("click", () => {
  currentEditingTimestamp = null;
  document.getElementById("journalText").value = "";
  document.getElementById("submitBtn").title = "Submit Entry";
  document.getElementById("cancelEditBtn").style.display = "none";
});

document.getElementById("exportBtn").addEventListener("click", exportData);
document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});
document.getElementById("importFile").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    importData(file);
  }
});
document.getElementById("searchBtn").addEventListener("click", () => {
  const keyword = document.getElementById("keyword").value.trim();
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  searchEntries(keyword, startDate, endDate);
});
document.getElementById("clearSearchBtn").addEventListener("click", () => {
  document.getElementById("keyword").value = "";
  document.getElementById("startDate").value = "";
  document.getElementById("endDate").value = "";
  loadEntries();
});

// Planner event listener for add/update
document.getElementById("addPlannerBtn").addEventListener("click", () => {
  const plannerText = document.getElementById("plannerText").value.trim();
  const plannerTime = document.getElementById("plannerTime").value;
  const plannerPriority = document.getElementById("plannerPriority").value;
  if (!plannerText) return;
  
  if (currentEditingPlannerId) {
    const transaction = db.transaction(["planner"], "readwrite");
    const store = transaction.objectStore("planner");
    const req = store.get(currentEditingPlannerId);
    req.onsuccess = function (event) {
      let item = event.target.result;
      if (item) {
        updatePlannerItem(currentEditingPlannerId, plannerText, plannerTime, plannerPriority, item.completed);
      }
    };
  } else {
    addPlannerItem(plannerText, plannerTime, plannerPriority);
  }
  document.getElementById("plannerText").value = "";
  document.getElementById("plannerTime").value = "";
  document.getElementById("plannerPriority").value = "Medium";
  currentEditingPlannerId = null;
  document.getElementById("addPlannerBtn").title = "Add Planner Item";
  document.getElementById("cancelPlannerEditBtn").style.display = "none";
});

// Cancel planner edit
document.getElementById("cancelPlannerEditBtn").addEventListener("click", () => {
  currentEditingPlannerId = null;
  document.getElementById("plannerText").value = "";
  document.getElementById("plannerTime").value = "";
  document.getElementById("plannerPriority").value = "Medium";
  document.getElementById("addPlannerBtn").title = "Add Planner Item";
  document.getElementById("cancelPlannerEditBtn").style.display = "none";
});

/* ========================= Helper Function ========================= */

function formatTimestamp(isoTimestamp) {
  const date = new Date(isoTimestamp);
  return date.toLocaleString();
}
