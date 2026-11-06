// Owns one background lookup. A taken lookup belongs to the next question.
export function createAudioPrefetch(resolve, delay = 650) {
    let pending = null;
    const taken = new Set();
    function begin(task) {
        clearTimeout(task.timer);
        if (!task.promise) task.promise = Promise.resolve().then(() => {
            if (task.controller.signal.aborted) return null;
            return resolve(task.song, task.controller.signal);
        }).catch(() => null).finally(() => taken.delete(task));
        return task.promise;
    }
    function cancel(includeTaken = false) {
        if (pending) { clearTimeout(pending.timer); pending.controller.abort(); pending = null; }
        if (includeTaken) { for (const task of taken) task.controller.abort(); taken.clear(); }
    }
    return {
        schedule(key, song) {
            if (pending?.key === key) return;
            cancel();
            const task = { key, song, controller: new AbortController(), promise: null, timer: null };
            pending = task;
            task.timer = setTimeout(() => begin(task), delay);
        },
        take(key) {
            if (!pending || pending.key !== key) return null;
            const task = pending;
            pending = null;
            taken.add(task);
            return begin(task);
        },
        cancel
    };
}
