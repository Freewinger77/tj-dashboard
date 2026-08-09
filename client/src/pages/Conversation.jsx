import { useState } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Phone, OctagonX, Clock, Send, MessageSquareReply, Loader2, Info, X } from 'lucide-react';
import { fetchCustomer, fetchChat, stopReminders } from '../lib/api.js';
import { absoluteTime, formatPhone } from '../lib/format.js';
import StatusPill from '../components/ui/StatusPill.jsx';
import ChatViewer from '../components/chat/ChatViewer.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';

export default function ConversationPage() {
  const { phone } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [showInfo, setShowInfo] = useState(false);
  const returnTo = location.state?.returnTo || '/conversations';

  const customerQ = useQuery({ queryKey: ['customer', phone], queryFn: () => fetchCustomer(phone) });
  const chatQ = useQuery({ queryKey: ['chat', phone], queryFn: () => fetchChat(phone) });

  const stopMutation = useMutation({
    mutationFn: () => stopReminders(phone),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', phone] });
    },
  });

  const customer = customerQ.data;
  const messages = chatQ.data?.messages;

  return (
    <div className="flex h-dvh flex-col bg-[color:var(--color-canvas)]">
      <div className="flex items-center gap-3 border-b rule bg-[color:var(--color-canvas)]/90 px-4 py-2.5 backdrop-blur-sm sm:px-6">
        <Link
          to={returnTo}
          className="grid size-8 place-items-center rounded-lg border rule text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--color-ink)]"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </Link>
        <div className="min-w-0 flex-1">
          {customerQ.isLoading ? (
            <Skeleton className="h-5 w-48" />
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-[14px] font-semibold text-[color:var(--color-ink)]">
                {customer?.name || 'Customer'}
              </span>
              {customer && <StatusPill status={customer.status} />}
              {customer?.campaign_type && (
                <span className="text-[11px] text-[color:var(--color-ink-4)]">
                  {customer.campaign_type === 'passed' ? 'Passed' : 'Due soon'}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          className="lg:hidden grid size-8 place-items-center rounded-full border rule text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] hover:border-[color:var(--color-rule-strong)] transition-colors"
          aria-label="Customer info"
        >
          <Info size={16} strokeWidth={1.75} />
        </button>
        {customer && !customer.stop_reminders && (
          <button
            type="button"
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
            className="hidden items-center gap-1.5 rounded-lg border border-[color:var(--color-sienna)]/30 px-3 py-1.5 text-[11px] font-medium text-[color:var(--color-sienna)] transition-colors hover:bg-[color:var(--color-sienna-soft)] disabled:opacity-50 sm:inline-flex"
          >
            {stopMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <OctagonX size={12} strokeWidth={1.75} />
            )}
            Stop Reminders
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 relative">
        <div className="flex-1 flex flex-col min-w-0 bg-[color:var(--color-canvas-sunk)]">
          <ChatViewer messages={messages} loading={chatQ.isLoading} />
        </div>

        <aside className="hidden lg:flex w-72 flex-col border-l rule bg-[color:var(--color-canvas-raised)] overflow-y-auto">
          <CustomerInfoPanel customer={customer} loading={customerQ.isLoading} stopMutation={stopMutation} />
        </aside>

        {showInfo && (
          <>
            <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setShowInfo(false)} />
            <aside className="lg:hidden fixed right-0 top-0 bottom-0 z-40 w-[min(320px,85vw)] flex flex-col bg-[color:var(--color-canvas-raised)] shadow-xl overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-3 border-b rule">
                <span className="text-[13px] font-medium text-[color:var(--color-ink)]">Customer Info</span>
                <button
                  type="button"
                  onClick={() => setShowInfo(false)}
                  className="grid size-8 place-items-center rounded-full border rule text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] transition-colors"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>
              <CustomerInfoPanel customer={customer} loading={customerQ.isLoading} stopMutation={stopMutation} showStop />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

function CustomerInfoPanel({ customer, loading, stopMutation, showStop }) {
  if (loading) {
    return (
      <div className="p-5 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }
  if (!customer) return null;

  return (
    <div className="p-5 space-y-5">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-ink-4)]">
        Identity
      </h4>
      <InfoRow icon={Phone} label="Phone" value={formatPhone(customer.number)} />
      <InfoRow label="Campaign" value={customer.campaign_type} />
      <InfoRow label="Template" value={customer.template_name} />
      <InfoRow label="Reminder stage" value={customer.reminder_stage} />
      <InfoRow label="Customer ID" value={customer.customer_id} />
      <InfoRow label="Station ID" value={customer.station_id} />

      <div className="border-t rule pt-4 space-y-3">
        <h4 className="text-[10px] font-semibold text-[color:var(--color-ink-4)] uppercase tracking-[0.18em]">
          Timeline
        </h4>
        <TimelineRow icon={Send} label="First sent" date={customer.last_outbound_at} />
        <TimelineRow icon={MessageSquareReply} label="Last reply" date={customer.last_inbound_at} />
        <TimelineRow icon={Clock} label="Next reminder" date={customer.next_reminder_at} />
      </div>

      {showStop && customer && !customer.stop_reminders && stopMutation && (
        <button
          type="button"
          onClick={() => stopMutation.mutate()}
          disabled={stopMutation.isPending}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[color:var(--color-sienna)]/30 px-3 py-2 text-[11px] font-medium text-[color:var(--color-sienna)] hover:bg-[color:var(--color-sienna-soft)] transition-colors disabled:opacity-50"
        >
          {stopMutation.isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <OctagonX size={12} strokeWidth={1.75} />
          )}
          Stop Reminders
        </button>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-[11px]">
      {Icon && <Icon size={12} className="mt-0.5 text-[color:var(--color-ink-4)]" strokeWidth={1.75} />}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-4)]">{label}</div>
        <div className="text-[color:var(--color-ink)] font-medium break-all">{String(value)}</div>
      </div>
    </div>
  );
}

function TimelineRow({ icon: Icon, label, date }) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <Icon size={12} className="mt-0.5 text-[color:var(--color-ink-4)]" strokeWidth={1.75} />
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-4)]">{label}</div>
        <div className="text-[color:var(--color-ink)]">{absoluteTime(date)}</div>
      </div>
    </div>
  );
}
