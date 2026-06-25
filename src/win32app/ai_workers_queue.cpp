#include <deque>
#include <functional>
#include <mutex>

namespace {
std::deque<std::function<void()>> g_invokeQueue;
std::mutex* g_invokeQueueMutex = nullptr;

std::mutex* GetInvokeQueueMutex() {
    if (!g_invokeQueueMutex) {
        g_invokeQueueMutex = new (std::nothrow) std::mutex();
    }
    return g_invokeQueueMutex;
}
}

void AIWorkersInvokeLater(std::function<void()> f) {
    if (!f) {
        return;
    }
    std::mutex* mtx = GetInvokeQueueMutex();
    if (!mtx) return;
    std::lock_guard<std::mutex> lock(*mtx);
    g_invokeQueue.push_back(std::move(f));
}

void AIWorkersProcessInvokeQueue() {
    std::deque<std::function<void()>> pending;
    {
        std::mutex* mtx = GetInvokeQueueMutex();
        if (!mtx) return;
        std::lock_guard<std::mutex> lock(*mtx);
        pending.swap(g_invokeQueue);
    }
    for (auto& task : pending) {
        task();
    }
}
