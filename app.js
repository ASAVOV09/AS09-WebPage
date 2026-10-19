"use strict";

const byId = (id) => document.getElementById(id);

function setStatus(message, type = "") {
    const status = document.querySelector("[data-status]");
    if (!status) return;
    status.textContent = message;
    status.className = `status-message${type ? ` ${type}` : ""}`;
}

function readCollection(key, description) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return [];
        const value = JSON.parse(raw);
        if (!Array.isArray(value)) throw new Error("Saved data is not a list.");
        return value;
    } catch (error) {
        console.error(`Could not read ${description}.`, error);
        setStatus(`Your saved ${description} could not be read. It may be damaged or browser storage may be unavailable.`, "error");
        return [];
    }
}

function saveCollection(key, value, description) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        setStatus(`${description} saved.`);
        return true;
    } catch (error) {
        console.error(`Could not save ${description}.`, error);
        setStatus(`Your ${description} could not be saved. Check that browser storage is available.`, "error");
        return false;
    }
}

function createId() {
    return globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function setupNavigation() {
    const toggle = byId("menuToggle");
    const menu = byId("navMenu");
    if (!toggle || !menu) return;

    toggle.addEventListener("click", () => {
        const isOpen = menu.classList.toggle("show");
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
    });
    menu.addEventListener("click", (event) => {
        if (event.target.closest("a")) {
            menu.classList.remove("show");
            toggle.setAttribute("aria-expanded", "false");
            toggle.setAttribute("aria-label", "Open navigation");
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && menu.classList.contains("show")) {
            menu.classList.remove("show");
            toggle.setAttribute("aria-expanded", "false");
            toggle.focus();
        }
    });
}

function setupHome() {
    const datePreview = byId("homeCalDate");
    if (datePreview) {
        datePreview.textContent = `Today: ${new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
            year: "numeric"
        })}`;
    }

    const notesPreview = byId("homeNotesCount");
    if (notesPreview) {
        const notes = readCollection("webtools_notes", "notes");
        notesPreview.textContent = `${notes.length} ${notes.length === 1 ? "note" : "notes"} saved on this device`;
    }

    const clockPreview = byId("homeClockPreview");
    if (clockPreview) {
        const updateClock = () => {
            clockPreview.textContent = new Date().toLocaleTimeString();
        };
        updateClock();
        window.setInterval(updateClock, 1000);
    }
}

function evaluateExpression(source) {
    let index = 0;
    const skipSpaces = () => {
        while (/\s/.test(source[index] || "")) index += 1;
    };

    function parseFactor() {
        skipSpaces();
        if (source[index] === "+" || source[index] === "-") {
            const sign = source[index] === "-" ? -1 : 1;
            index += 1;
            return sign * parseFactor();
        }
        if (source[index] === "(") {
            index += 1;
            const value = parseExpression();
            skipSpaces();
            if (source[index] !== ")") throw new Error("Missing closing parenthesis.");
            index += 1;
            return value;
        }

        const match = source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)/);
        if (!match) throw new Error("Enter a valid number.");
        index += match[0].length;
        return Number(match[0]);
    }

    function parseTerm() {
        let value = parseFactor();
        while (true) {
            skipSpaces();
            const operator = source[index];
            if (operator !== "*" && operator !== "/") return value;
            index += 1;
            const right = parseFactor();
            if (operator === "/" && right === 0) throw new Error("Cannot divide by zero.");
            value = operator === "*" ? value * right : value / right;
        }
    }

    function parseExpression() {
        let value = parseTerm();
        while (true) {
            skipSpaces();
            const operator = source[index];
            if (operator !== "+" && operator !== "-") return value;
            index += 1;
            const right = parseTerm();
            value = operator === "+" ? value + right : value - right;
        }
    }

    if (!source.trim() || /[^0-9+\-*\/().\s]/.test(source)) {
        throw new Error("Enter a calculation using numbers and +, −, ×, ÷, or parentheses.");
    }
    const result = parseExpression();
    skipSpaces();
    if (index !== source.length) throw new Error("Check the calculation and parentheses.");
    if (!Number.isFinite(result)) throw new Error("The result is outside the supported range.");
    return result;
}

function setupCalculator() {
    const keys = byId("calcKeys");
    const output = byId("calcOutput");
    const history = byId("calcHistory");
    if (!keys || !output || !history) return;

    let expression = "";
    let historyText = "Ready";
    let justEvaluated = false;

    const render = () => {
        output.textContent = expression ? expression.replace(/\*/g, "×").replace(/\//g, "÷") : "0";
        history.textContent = historyText;
    };

    const press = (key) => {
        if (key === "clear") {
            expression = "";
            historyText = "Ready";
            justEvaluated = false;
            setStatus("");
        } else if (key === "delete") {
            expression = expression.slice(0, -1);
            historyText = "Ready";
            justEvaluated = false;
        } else if (key === "equals") {
            try {
                const result = evaluateExpression(expression);
                const formatted = Number.isInteger(result) ? String(result) : String(Number(result.toPrecision(12)));
                historyText = `${expression.replace(/\*/g, "×").replace(/\//g, "÷")} =`;
                expression = formatted;
                justEvaluated = true;
                setStatus("");
            } catch (error) {
                setStatus(error.message, "error");
            }
        } else {
            if (justEvaluated && /[0-9.(]/.test(key)) expression = "";
            expression += key;
            historyText = "Ready";
            justEvaluated = false;
            setStatus("");
        }
        render();
    };

    keys.addEventListener("click", (event) => {
        const button = event.target.closest("[data-calc-key]");
        if (button) press(button.dataset.calcKey);
    });

    document.addEventListener("keydown", (event) => {
        if (event.target.matches("input, textarea, select")) return;
        if (/^[0-9.+\-*\/()]$/.test(event.key)) {
            event.preventDefault();
            press(event.key);
        } else if (event.key === "Enter" || event.key === "=") {
            event.preventDefault();
            press("equals");
        } else if (event.key === "Backspace") {
            event.preventDefault();
            press("delete");
        } else if (event.key === "Escape") {
            press("clear");
        }
    });
    render();
}

function setupCalendar() {
    const grid = byId("calendarGrid");
    const form = byId("eventForm");
    if (!grid || !form) return;

    const monthHeading = byId("calendarMonth");
    const selectedDateLabel = byId("selectedDateLabel");
    const eventList = byId("eventList");
    const titleInput = byId("eventTitle");
    const timeInput = byId("eventTime");
    const today = new Date();
    let shownMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    let selectedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let events = readCollection("webtools_events", "calendar events");

    const renderEvents = () => {
        const selectedKey = localDateKey(selectedDate);
        selectedDateLabel.textContent = selectedDate.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        });
        eventList.replaceChildren();
        const forDate = events
            .filter((item) => item && item.date === selectedKey && typeof item.title === "string")
            .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

        if (forDate.length === 0) {
            const empty = document.createElement("li");
            empty.className = "empty-event";
            empty.textContent = "No events for this day.";
            eventList.append(empty);
            return;
        }

        forDate.forEach((item) => {
            const row = document.createElement("li");
            row.className = "event-item";
            const label = document.createElement("span");
            label.textContent = `${item.time ? `${item.time} — ` : ""}${item.title}`;
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "note-action-btn del";
            remove.textContent = "Delete";
            remove.setAttribute("aria-label", `Delete event: ${item.title}`);
            remove.addEventListener("click", () => {
                const previous = events;
                events = events.filter((event) => event.id !== item.id);
                if (saveCollection("webtools_events", events, "Calendar event")) {
                    renderCalendar();
                } else {
                    events = previous;
                }
            });
            row.append(label, remove);
            eventList.append(row);
        });
    };

    function renderCalendar() {
        monthHeading.textContent = shownMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        grid.replaceChildren();
        const firstDay = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1);
        const gridStart = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - firstDay.getDay());
        const todayKey = localDateKey(today);

        for (let i = 0; i < 42; i += 1) {
            const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
            const dateKey = localDateKey(date);
            const dayEvents = events.filter((item) => item && item.date === dateKey);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "cal-day";
            button.setAttribute("role", "gridcell");
            button.setAttribute("aria-label", `${date.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
            })}${dayEvents.length ? `, ${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"}` : ""}`);
            button.setAttribute("aria-pressed", String(dateKey === localDateKey(selectedDate)));
            button.dataset.date = dateKey;
            button.textContent = String(date.getDate());
            if (date.getMonth() !== shownMonth.getMonth()) button.classList.add("other-month");
            if (dateKey === todayKey) button.classList.add("today");
            if (dateKey === localDateKey(selectedDate)) button.classList.add("selected");
            if (dayEvents.length) {
                const marker = document.createElement("span");
                marker.className = "cal-event-marker";
                marker.setAttribute("aria-hidden", "true");
                button.append(marker);
            }
            grid.append(button);
        }
        renderEvents();
    }

    grid.addEventListener("click", (event) => {
        const button = event.target.closest("[data-date]");
        if (!button) return;
        const [year, month, day] = button.dataset.date.split("-").map(Number);
        selectedDate = new Date(year, month - 1, day);
        shownMonth = new Date(year, month - 1, 1);
        renderCalendar();
    });

    byId("previousMonth").addEventListener("click", () => {
        shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() - 1, 1);
        selectedDate = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1);
        renderCalendar();
    });
    byId("nextMonth").addEventListener("click", () => {
        shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1);
        selectedDate = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1);
        renderCalendar();
    });
    byId("goToday").addEventListener("click", () => {
        shownMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        selectedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        renderCalendar();
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = titleInput.value.trim();
        if (!title) {
            setStatus("Enter an event name first.", "error");
            titleInput.focus();
            return;
        }
        events.push({
            id: createId(),
            date: localDateKey(selectedDate),
            title,
            time: timeInput.value
        });
        if (saveCollection("webtools_events", events, "Calendar event")) {
            form.reset();
            renderCalendar();
            titleInput.focus();
        } else {
            events.pop();
        }
    });
    renderCalendar();
}

function setupNotes() {
    const form = byId("noteForm");
    const grid = byId("notesGrid");
    if (!form || !grid) return;

    const idInput = byId("noteId");
    const titleInput = byId("noteTitle");
    const bodyInput = byId("noteBody");
    const colorInput = byId("noteColor");
    const searchInput = byId("noteSearch");
    const saveButton = byId("saveNoteButton");
    const cancelButton = byId("cancelNoteEdit");
    const count = byId("notesCount");
    let notes = readCollection("webtools_notes", "notes");

    const resetEditor = () => {
        form.reset();
        idInput.value = "";
        saveButton.textContent = "Save note";
        cancelButton.hidden = true;
    };

    const renderNotes = () => {
        const query = searchInput.value.trim().toLocaleLowerCase();
        const visible = notes
            .filter((note) => note && typeof note.title === "string" && typeof note.body === "string")
            .filter((note) => `${note.title}\n${note.body}`.toLocaleLowerCase().includes(query))
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        count.textContent = `${visible.length} ${visible.length === 1 ? "note" : "notes"}`;
        grid.replaceChildren();

        if (visible.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            const message = document.createElement("p");
            message.textContent = query ? "No notes match your search." : "No notes yet. Add one above to get started.";
            empty.append(message);
            grid.append(empty);
            return;
        }

        visible.forEach((note) => {
            const card = document.createElement("article");
            card.className = `note-card note-color-${["indigo", "blue", "green", "amber", "rose"].includes(note.color) ? note.color : "indigo"}`;
            const heading = document.createElement("div");
            heading.className = "note-card-header";
            const title = document.createElement("h2");
            title.className = "note-card-title";
            title.textContent = note.title;
            heading.append(title);

            const date = document.createElement("p");
            date.className = "note-card-date";
            date.textContent = `Updated ${new Date(note.updatedAt || note.createdAt || Date.now()).toLocaleString()}`;

            const body = document.createElement("p");
            body.className = "note-card-body";
            body.textContent = note.body;

            const actions = document.createElement("div");
            actions.className = "note-card-actions";
            const edit = document.createElement("button");
            edit.type = "button";
            edit.className = "note-action-btn";
            edit.textContent = "Edit";
            edit.addEventListener("click", () => {
                idInput.value = note.id;
                titleInput.value = note.title;
                bodyInput.value = note.body;
                colorInput.value = ["indigo", "blue", "green", "amber", "rose"].includes(note.color) ? note.color : "indigo";
                saveButton.textContent = "Update note";
                cancelButton.hidden = false;
                titleInput.focus();
            });
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "note-action-btn del";
            remove.textContent = "Delete";
            remove.addEventListener("click", () => {
                if (!window.confirm(`Delete "${note.title}"?`)) return;
                const previous = notes;
                notes = notes.filter((item) => item.id !== note.id);
                if (saveCollection("webtools_notes", notes, "Notes")) {
                    if (idInput.value === note.id) resetEditor();
                    renderNotes();
                } else {
                    notes = previous;
                }
            });
            actions.append(edit, remove);
            card.append(heading, date, body, actions);
            grid.append(card);
        });
    };

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = titleInput.value.trim();
        const body = bodyInput.value.trim();
        if (!title || !body) {
            setStatus("Enter both a title and note text.", "error");
            return;
        }
        const existingIndex = notes.findIndex((note) => note && note.id === idInput.value);
        const now = Date.now();
        const note = {
            id: existingIndex >= 0 ? notes[existingIndex].id : createId(),
            title,
            body,
            color: colorInput.value,
            createdAt: existingIndex >= 0 ? notes[existingIndex].createdAt || now : now,
            updatedAt: now
        };
        const previous = notes;
        if (existingIndex >= 0) {
            notes = notes.map((item, index) => index === existingIndex ? note : item);
        } else {
            notes = [note, ...notes];
        }
        if (saveCollection("webtools_notes", notes, "Notes")) {
            resetEditor();
            renderNotes();
        } else {
            notes = previous;
        }
    });

    searchInput.addEventListener("input", renderNotes);
    cancelButton.addEventListener("click", resetEditor);
    renderNotes();
}

function setupClock() {
    const timeDisplay = byId("digitalTime");
    if (!timeDisplay) return;

    const dateDisplay = byId("digitalDate");
    const formatToggle = byId("hourFormat");
    const updateClock = () => {
        const now = new Date();
        timeDisplay.textContent = now.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: !formatToggle.checked
        });
        dateDisplay.textContent = now.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        });
    };
    formatToggle.addEventListener("change", updateClock);
    updateClock();
    window.setInterval(updateClock, 1000);

    const stopwatchDisplay = byId("stopwatchDisplay");
    const stopwatchStart = byId("stopwatchStart");
    const stopwatchLap = byId("stopwatchLap");
    const stopwatchReset = byId("stopwatchReset");
    const laps = byId("stopwatchLaps");
    let elapsed = 0;
    let stopwatchStartedAt = 0;
    let stopwatchInterval = null;

    const currentElapsed = () => stopwatchInterval === null ? elapsed : elapsed + performance.now() - stopwatchStartedAt;
    const formatStopwatch = (milliseconds) => {
        const totalCentiseconds = Math.floor(milliseconds / 10);
        const centiseconds = totalCentiseconds % 100;
        const totalSeconds = Math.floor(totalCentiseconds / 100);
        const seconds = totalSeconds % 60;
        const minutes = Math.floor(totalSeconds / 60) % 60;
        const hours = Math.floor(totalSeconds / 3600);
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
    };
    const renderStopwatch = () => {
        stopwatchDisplay.textContent = formatStopwatch(currentElapsed());
    };

    stopwatchStart.addEventListener("click", () => {
        if (stopwatchInterval === null) {
            stopwatchStartedAt = performance.now();
            stopwatchInterval = window.setInterval(renderStopwatch, 30);
            stopwatchStart.textContent = "Pause";
            stopwatchLap.disabled = false;
        } else {
            elapsed = currentElapsed();
            window.clearInterval(stopwatchInterval);
            stopwatchInterval = null;
            stopwatchStart.textContent = "Resume";
            renderStopwatch();
        }
    });
    stopwatchLap.addEventListener("click", () => {
        if (stopwatchInterval === null) return;
        const row = document.createElement("li");
        row.className = "lap-row";
        const number = document.createElement("span");
        number.textContent = `Lap ${laps.children.length + 1}`;
        const value = document.createElement("time");
        value.textContent = formatStopwatch(currentElapsed());
        row.append(number, value);
        laps.prepend(row);
    });
    stopwatchReset.addEventListener("click", () => {
        if (stopwatchInterval !== null) window.clearInterval(stopwatchInterval);
        stopwatchInterval = null;
        elapsed = 0;
        laps.replaceChildren();
        stopwatchStart.textContent = "Start";
        stopwatchLap.disabled = true;
        renderStopwatch();
    });
    renderStopwatch();

    const minutesInput = byId("timerMinutes");
    const secondsInput = byId("timerSeconds");
    const timerDisplay = byId("timerDisplay");
    const timerStart = byId("timerStart");
    const timerReset = byId("timerReset");
    let timerRemaining = null;
    let timerDeadline = 0;
    let timerInterval = null;

    const getInputSeconds = () => {
        const minutes = Number(minutesInput.value);
        const seconds = Number(secondsInput.value);
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 999 ||
            !Number.isInteger(seconds) || seconds < 0 || seconds > 59) {
            setStatus("Enter whole minutes from 0 to 999 and seconds from 0 to 59.", "error");
            return null;
        }
        return minutes * 60 + seconds;
    };
    const renderTimer = () => {
        const remaining = timerInterval === null
            ? timerRemaining === null ? getInputSeconds() ?? 0 : timerRemaining
            : Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };
    const stopTimer = (finished = false) => {
        if (timerInterval !== null) window.clearInterval(timerInterval);
        timerInterval = null;
        timerRemaining = finished ? 0 : timerRemaining;
        timerStart.textContent = finished ? "Start" : "Resume";
        minutesInput.disabled = false;
        secondsInput.disabled = false;
        renderTimer();
        if (finished) setStatus("Countdown finished.");
    };
    timerStart.addEventListener("click", () => {
        if (timerInterval !== null) {
            timerRemaining = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
            stopTimer();
            return;
        }
        if (timerRemaining === 0) timerRemaining = null;
        if (timerRemaining === null) timerRemaining = getInputSeconds();
        if (timerRemaining === null) return;
        if (timerRemaining <= 0) {
            setStatus("Set a countdown longer than zero seconds.", "error");
            return;
        }
        setStatus("");
        minutesInput.disabled = true;
        secondsInput.disabled = true;
        timerStart.textContent = "Pause";
        timerDeadline = Date.now() + timerRemaining * 1000;
        timerInterval = window.setInterval(() => {
            const remaining = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
            timerRemaining = remaining;
            renderTimer();
            if (remaining <= 0) stopTimer(true);
        }, 100);
    });
    timerReset.addEventListener("click", () => {
        if (timerInterval !== null) window.clearInterval(timerInterval);
        timerInterval = null;
        timerRemaining = null;
        minutesInput.disabled = false;
        secondsInput.disabled = false;
        timerStart.textContent = "Start";
        setStatus("");
        renderTimer();
    });
    document.querySelectorAll("[data-seconds]").forEach((button) => {
        button.addEventListener("click", () => {
            if (timerInterval !== null) return;
            const total = Number(button.dataset.seconds);
            minutesInput.value = String(Math.floor(total / 60));
            secondsInput.value = String(total % 60);
            timerRemaining = null;
            setStatus("");
            renderTimer();
        });
    });
    [minutesInput, secondsInput].forEach((input) => input.addEventListener("input", () => {
        if (timerInterval === null) {
            timerRemaining = null;
            renderTimer();
        }
    }));
    renderTimer();
}

function setupTodos() {
    const form = byId("todoForm");
    const list = byId("todoList");
    if (!form || !list) return;

    const input = byId("todoInput");
    const count = byId("todoCount");
    let todos = readCollection("webtools_todos", "to-do list");
    let filter = "all";

    const render = () => {
        const visible = todos.filter((todo) => {
            if (!todo || typeof todo.text !== "string") return false;
            return filter === "all" || (filter === "active" ? !todo.completed : todo.completed);
        });
        const remaining = todos.filter((todo) => todo && !todo.completed).length;
        count.textContent = `${remaining} ${remaining === 1 ? "task" : "tasks"} remaining`;
        list.replaceChildren();
        document.querySelectorAll("[data-todo-filter]").forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.todoFilter === filter));
        });

        if (visible.length === 0) {
            const empty = document.createElement("li");
            empty.className = "todo-empty";
            empty.textContent = todos.length === 0 ? "No tasks yet. Add one above." : "No tasks in this view.";
            list.append(empty);
            return;
        }

        visible.forEach((todo) => {
            const row = document.createElement("li");
            row.className = `todo-item${todo.completed ? " completed" : ""}`;
            const label = document.createElement("label");
            label.className = "todo-item-label";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = Boolean(todo.completed);
            checkbox.dataset.todoToggle = todo.id;
            const text = document.createElement("span");
            text.textContent = todo.text;
            label.append(checkbox, text);
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "btn-secondary";
            remove.dataset.todoDelete = todo.id;
            remove.textContent = "Delete";
            remove.setAttribute("aria-label", `Delete task: ${todo.text}`);
            row.append(label, remove);
            list.append(row);
        });
    };

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) {
            setStatus("Enter a task first.", "error");
            input.focus();
            return;
        }
        const previous = todos;
        todos = [{ id: createId(), text, completed: false, createdAt: Date.now() }, ...todos];
        if (saveCollection("webtools_todos", todos, "To-do list")) {
            form.reset();
            render();
            input.focus();
        } else {
            todos = previous;
        }
    });

    document.querySelectorAll("[data-todo-filter]").forEach((button) => {
        button.addEventListener("click", () => {
            filter = button.dataset.todoFilter;
            render();
        });
    });

    list.addEventListener("change", (event) => {
        const checkbox = event.target.closest("[data-todo-toggle]");
        if (!checkbox) return;
        const previous = todos;
        todos = todos.map((todo) => todo.id === checkbox.dataset.todoToggle
            ? { ...todo, completed: checkbox.checked }
            : todo);
        if (saveCollection("webtools_todos", todos, "To-do list")) {
            render();
        } else {
            todos = previous;
            render();
        }
    });

    list.addEventListener("click", (event) => {
        const button = event.target.closest("[data-todo-delete]");
        if (!button) return;
        const previous = todos;
        todos = todos.filter((todo) => todo.id !== button.dataset.todoDelete);
        if (saveCollection("webtools_todos", todos, "To-do list")) {
            render();
        } else {
            todos = previous;
        }
    });

    byId("clearCompleted").addEventListener("click", () => {
        const previous = todos;
        todos = todos.filter((todo) => !todo.completed);
        if (saveCollection("webtools_todos", todos, "Completed tasks")) {
            render();
        } else {
            todos = previous;
        }
    });
    render();
}

function setupConverter() {
    const category = byId("conversionCategory");
    const valueInput = byId("conversionValue");
    const fromSelect = byId("conversionFrom");
    const toSelect = byId("conversionTo");
    const result = byId("conversionResult");
    if (!category || !valueInput || !fromSelect || !toSelect || !result) return;

    const units = {
        length: {
            m: { label: "Meters (m)", factor: 1 },
            km: { label: "Kilometers (km)", factor: 1000 },
            cm: { label: "Centimeters (cm)", factor: 0.01 },
            ft: { label: "Feet (ft)", factor: 0.3048 },
            mi: { label: "Miles (mi)", factor: 1609.344 }
        },
        weight: {
            kg: { label: "Kilograms (kg)", factor: 1 },
            g: { label: "Grams (g)", factor: 0.001 },
            lb: { label: "Pounds (lb)", factor: 0.45359237 },
            oz: { label: "Ounces (oz)", factor: 0.028349523125 }
        },
        temperature: {
            c: { label: "Celsius (°C)" },
            f: { label: "Fahrenheit (°F)" }
        }
    };

    const render = () => {
        if (valueInput.value === "") {
            result.textContent = "Enter a value to convert.";
            return;
        }
        const value = Number(valueInput.value);
        if (!Number.isFinite(value)) {
            result.textContent = "Enter a valid number.";
            return;
        }
        const selectedUnits = units[category.value];
        let converted;
        if (category.value === "temperature") {
            converted = fromSelect.value === toSelect.value
                ? value
                : fromSelect.value === "c" ? value * 9 / 5 + 32 : (value - 32) * 5 / 9;
        } else {
            converted = value * selectedUnits[fromSelect.value].factor / selectedUnits[toSelect.value].factor;
        }
        const formatted = Number(converted.toPrecision(10)).toString();
        result.textContent = `${value} ${fromSelect.value} = ${formatted} ${toSelect.value}`;
    };

    const updateUnits = () => {
        const selectedUnits = units[category.value];
        const unitKeys = Object.keys(selectedUnits);
        fromSelect.replaceChildren();
        toSelect.replaceChildren();
        unitKeys.forEach((key) => {
            fromSelect.add(new Option(selectedUnits[key].label, key));
            toSelect.add(new Option(selectedUnits[key].label, key));
        });
        fromSelect.value = unitKeys[0];
        toSelect.value = unitKeys[1] || unitKeys[0];
        render();
    };

    category.addEventListener("change", updateUnits);
    valueInput.addEventListener("input", render);
    fromSelect.addEventListener("change", render);
    toSelect.addEventListener("change", render);
    updateUnits();
}

function setupPasswordGenerator() {
    const button = byId("generatePassword");
    const output = byId("generatedPassword");
    if (!button || !output) return;

    const randomIndex = (maxExclusive) => {
        const range = 0x100000000;
        const limit = Math.floor(range / maxExclusive) * maxExclusive;
        const value = new Uint32Array(1);
        do {
            globalThis.crypto.getRandomValues(value);
        } while (value[0] >= limit);
        return value[0] % maxExclusive;
    };

    button.addEventListener("click", () => {
        const length = Number(byId("passwordLength").value);
        if (!Number.isInteger(length) || length < 8 || length > 64) {
            setStatus("Choose a password length from 8 to 64.", "error");
            return;
        }
        const characterSets = [
            byId("includeLowercase").checked ? "abcdefghijklmnopqrstuvwxyz" : "",
            byId("includeUppercase").checked ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "",
            byId("includeNumbers").checked ? "0123456789" : "",
            byId("includeSymbols").checked ? "!@#$%^&*()-_=+[]{}:,.?" : ""
        ].filter(Boolean);
        if (characterSets.length === 0) {
            setStatus("Choose at least one character type.", "error");
            return;
        }
        if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== "function") {
            setStatus("Secure password generation is not available in this browser.", "error");
            return;
        }

        const allCharacters = characterSets.join("");
        const password = characterSets.map((characters) => characters[randomIndex(characters.length)]);
        while (password.length < length) {
            password.push(allCharacters[randomIndex(allCharacters.length)]);
        }
        for (let index = password.length - 1; index > 0; index -= 1) {
            const swapIndex = randomIndex(index + 1);
            [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
        }
        output.textContent = password.join("");
        setStatus("");
    });
}

function setupPomodoro() {
    const minutesInput = byId("pomodoroMinutes");
    const display = byId("pomodoroDisplay");
    const startButton = byId("pomodoroStart");
    const resetButton = byId("pomodoroReset");
    if (!minutesInput || !display || !startButton || !resetButton) return;

    const modeLabel = byId("pomodoroMode");
    let remaining = null;
    let deadline = 0;
    let interval = null;
    let mode = "Focus";

    const getMinutes = () => {
        const minutes = Number(minutesInput.value);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
            setStatus("Enter a whole number of minutes from 1 to 180.", "error");
            return null;
        }
        return minutes;
    };
    const render = () => {
        const secondsLeft = interval === null
            ? remaining === null ? (getMinutes() || 0) * 60 : remaining
            : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        display.textContent = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;
    };
    const stop = (finished = false) => {
        if (interval !== null) window.clearInterval(interval);
        interval = null;
        if (finished) remaining = 0;
        minutesInput.disabled = false;
        startButton.textContent = remaining === null || finished ? "Start" : "Resume";
        render();
        if (finished) setStatus(`${mode} session complete.`);
    };

    startButton.addEventListener("click", () => {
        if (interval !== null) {
            remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            stop();
            return;
        }
        if (remaining === 0) remaining = null;
        if (remaining === null) {
            const minutes = getMinutes();
            if (minutes === null) return;
            remaining = minutes * 60;
        }
        minutesInput.disabled = true;
        startButton.textContent = "Pause";
        deadline = Date.now() + remaining * 1000;
        setStatus("");
        interval = window.setInterval(() => {
            remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            render();
            if (remaining <= 0) stop(true);
        }, 200);
    });

    resetButton.addEventListener("click", () => {
        if (interval !== null) window.clearInterval(interval);
        interval = null;
        remaining = null;
        minutesInput.disabled = false;
        startButton.textContent = "Start";
        setStatus("");
        render();
    });

    document.querySelectorAll("[data-minutes][data-label]").forEach((button) => {
        button.addEventListener("click", () => {
            if (interval !== null) return;
            mode = button.dataset.label;
            minutesInput.value = button.dataset.minutes;
            remaining = null;
            modeLabel.textContent = `${mode} session`;
            document.querySelectorAll("[data-minutes][data-label]").forEach((preset) => {
                preset.setAttribute("aria-pressed", String(preset === button));
            });
            setStatus("");
            render();
        });
    });
    minutesInput.addEventListener("input", () => {
        if (interval === null) {
            remaining = null;
            render();
        }
    });
    render();
}

function setupTextTools() {
    const input = byId("textToAnalyze");
    if (!input) return;

    const wordCount = byId("wordCount");
    const characterCount = byId("characterCount");
    const sentenceCount = byId("sentenceCount");
    const readingTime = byId("readingTime");

    const updateStats = () => {
        const text = input.value;
        const trimmed = text.trim();
        const words = trimmed ? trimmed.split(/\s+/u) : [];
        const sentences = trimmed
            ? (trimmed.match(/[^.!?]+(?:[.!?]+|$)/gu) || []).filter((sentence) => sentence.trim()).length
            : 0;
        wordCount.textContent = String(words.length);
        characterCount.textContent = String(text.length);
        sentenceCount.textContent = String(sentences);
        readingTime.textContent = `${words.length ? Math.ceil(words.length / 200) : 0} min`;
    };
    input.addEventListener("input", updateStats);
    updateStats();
}

function setupContrastChecker() {
    const textColor = byId("contrastTextColor");
    const backgroundColor = byId("contrastBackgroundColor");
    const sample = byId("contrastSample");
    const result = byId("contrastResult");
    if (!textColor || !backgroundColor || !sample || !result) return;

    const luminance = (hexColor) => {
        const channels = hexColor.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
        const linear = channels.map((channel) => channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4);
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };

    const update = () => {
        sample.style.color = textColor.value;
        sample.style.backgroundColor = backgroundColor.value;
        const first = luminance(textColor.value);
        const second = luminance(backgroundColor.value);
        const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        const formatted = ratio.toFixed(2);
        const normalPass = ratio >= 4.5;
        const largePass = ratio >= 3;
        result.textContent = `Contrast ratio: ${formatted}:1 · AA normal text: ${normalPass ? "Pass" : "Fail"} · AA large text: ${largePass ? "Pass" : "Fail"}`;
    };
    textColor.addEventListener("input", update);
    backgroundColor.addEventListener("input", update);
    update();
}

setupNavigation();
setupHome();
setupCalculator();
setupCalendar();
setupNotes();
setupClock();
setupTodos();
setupConverter();
setupPasswordGenerator();
setupPomodoro();
setupTextTools();
setupContrastChecker();
