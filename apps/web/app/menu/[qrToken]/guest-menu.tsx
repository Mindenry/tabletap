'use client';

import * as React from 'react';
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Check,
  ChevronRight,
  Clock,
  Flame,
  Minus,
  Plus,
  QrCode,
  Receipt,
  Search,
  ShoppingBag,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { socketBaseUrl } from '@/lib/socket';
import { DEMO_MODE } from '@/lib/demo/config';
import { connectRealtime } from '@/lib/realtime';
import { cn, elapsedLabel, formatTHB } from '@/lib/utils';

interface PublicOption {
  id: string;
  name: string;
  nameEn: string | null;
  priceDelta: string;
}

interface PublicGroup {
  id: string;
  name: string;
  nameEn: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: PublicOption[];
}

export interface PublicItem {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  description: string | null;
  descriptionEn: string | null;
  imageUrl: string | null;
  basePrice: string;
  prepMinutes: number;
  isFeatured: boolean;
  isPopular: boolean;
  available: boolean;
  soldOut: boolean;
  variants: Array<{
    id: string;
    name: string;
    nameEn: string | null;
    priceDelta: string;
    isDefault: boolean;
  }>;
  modifierGroups: PublicGroup[];
  allergens: Array<{ code: string; name: string; nameTh: string | null }>;
}

interface PublicCategory {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  items: PublicItem[];
}

interface CartLine {
  key: string;
  itemId: string;
  name: string;
  basePrice: string;
  variantId?: string;
  variantName?: string;
  variantDelta: string;
  modifierOptionIds: string[];
  modifierNames: string[];
  modifiersTotal: string;
  note?: string;
  quantity: number;
}

interface SessionOrder {
  id: string;
  number: string;
  status: string;
  total: string;
  createdAt: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    status: string;
    note: string | null;
    modifiers: Array<{ name: string }>;
  }>;
}

interface SessionState {
  status: string;
  table: { id: string; number: string; name: string | null };
  restaurant: { name: string; branch: string };
  orders: SessionOrder[];
  bill: { id: string; number: string; status: string; total: string; due: string } | null;
  orderTotal: string;
  requests: Array<{ id: string; type: string; status: string; createdAt: string }>;
}

interface GuestPayment {
  paymentId: string;
  amount: string;
  qrDataUrl: string;
  reference: string;
  accountName: string | null;
  promptPayTarget: string | null;
}

function estimateLine(line: CartLine): number {
  return (Number(line.basePrice) + Number(line.variantDelta) + Number(line.modifiersTotal)) * line.quantity;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

function lineOptionSummary(line: CartLine): string | null {
  const parts = [line.variantName, ...line.modifierNames].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function agoLabel(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  return seconds < 60 ? 'just now' : `${elapsedLabel(value)} ago`;
}

const ORDER_STEPS = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] as const;

const ORDER_LABEL: Record<string, string> = {
  PENDING: 'Sent',
  ACCEPTED: 'Accepted',
  PREPARING: 'In the kitchen',
  READY: 'Ready to serve',
  SERVED: 'Served',
  CANCELLED: 'Cancelled',
};

function useDismiss(active: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [active, onClose]);
}

export function GuestMenu({
  token,
  restaurant,
  table,
  initialMenu,
}: {
  token: string;
  restaurant: { name: string; branch: string; currency: string; timezone: string; logoUrl: string | null };
  table: { id: string; number: string; name: string | null };
  initialMenu: PublicCategory[];
}) {
  const [menu, setMenu] = React.useState(initialMenu);
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState(initialMenu[0]?.id ?? '');
  const [search, setSearch] = React.useState('');
  const [promoCode, setPromoCode] = React.useState('');
  const [pay, setPay] = React.useState<GuestPayment | null>(null);
  const [payBusy, setPayBusy] = React.useState(false);
  const [detail, setDetail] = React.useState<PublicItem | null>(null);
  const [view, setView] = React.useState<'menu' | 'orders'>('menu');
  const [session, setSession] = React.useState<SessionState | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [sessionReady, setSessionReady] = React.useState(false);
  const [lastOrderId, setLastOrderId] = React.useState<string | null>(null);
  const [requestBusy, setRequestBusy] = React.useState(false);
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  const idempotencyRef = React.useRef<string>(`ord-${Math.random().toString(36).slice(2)}`);

  // A guest with no session yet is the normal first visit. Probing the session
  // endpoint would answer 401 and surface a console error, so remember locally
  // that a session exists before asking the API about it.
  const sessionHint = `tt-session-${token}`;
  const hasSessionHint = React.useCallback(() => {
    try {
      return localStorage.getItem(sessionHint) === '1';
    } catch {
      return false;
    }
  }, [sessionHint]);
  const markSession = React.useCallback(() => {
    try {
      localStorage.setItem(sessionHint, '1');
    } catch {
      // storage can be unavailable in private mode
    }
  }, [sessionHint]);

  // Restore the cart for this table across refreshes.
  React.useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`tt-cart-${token}`);
      if (stored) setCart(JSON.parse(stored) as CartLine[]);
    } catch {
      // ignore malformed storage
    }
  }, [token]);

  React.useEffect(() => {
    try {
      sessionStorage.setItem(`tt-cart-${token}`, JSON.stringify(cart));
    } catch {
      // storage can be unavailable in private mode
    }
  }, [cart, token]);

  const refreshSession = React.useCallback(async () => {
    if (!hasSessionHint()) return;
    try {
      const state = await clientApi<SessionState>('/public/customer-session');
      setSession(state);
    } catch (error) {
      // A reset cookie or an ended session is expected; the next order recreates it.
      if (!(error instanceof Error && 'status' in error && (error as { status?: number }).status === 401)) {
        // keep the UI usable; the next action will surface a real error
      }
    }
  }, [hasSessionHint]);

  // The table state is part of the surface, not only of the orders screen: load it
  // once and keep it current so the cart rail can show live progress.
  React.useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // The public demo has no API socket, so keep the session fresh with polling
  // and open a session automatically instead of waiting for the Orders tab.
  React.useEffect(() => {
    if (!DEMO_MODE) return;
    markSession();
    void refreshSession();
    const timer = setInterval(() => void refreshSession(), 5000);
    return () => clearInterval(timer);
  }, [markSession, refreshSession]);

  React.useEffect(() => {
    const apiUrl = socketBaseUrl();
    const socket: Socket = connectRealtime(`${apiUrl}/realtime`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    const onChange = () => void refreshSession();
    socket.on('order.updated', onChange);
    socket.on('order.accepted', onChange);
    socket.on('kitchen.item.ready', onChange);
    socket.on('table.updated', onChange);
    return () => {
      socket.disconnect();
    };
  }, [refreshSession]);

  React.useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(null), 1200);
    return () => clearTimeout(timer);
  }, [justAdded]);

  React.useEffect(() => {
    if (!pay) return;
    const timer = setInterval(() => void refreshSession(), 5000);
    return () => clearInterval(timer);
  }, [pay, refreshSession]);

  React.useEffect(() => {
    if (!pay || !session?.bill) return;
    if (session.bill.status === 'PAID' || Number(session.bill.due) <= 0) {
      setPay(null);
      toast.success('Payment received — thank you');
    }
  }, [pay, session]);

  async function startPromptPay() {
    setPayBusy(true);
    try {
      const qr = await clientApi<GuestPayment>('/public/customer-session/payments/promptpay', {
        method: 'POST',
      });
      setPay(qr);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPayBusy(false);
    }
  }

  async function ensureSession(): Promise<boolean> {
    if (sessionReady) return true;
    try {
      await clientApi(`/public/qr/${token}/session`, { method: 'POST', body: { guestCount: 0 } });
      setSessionReady(true);
      markSession();
      return true;
    } catch (error) {
      if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 409) {
        // The table is settling its bill; this browser has no usable session.
        toast.error(errorMessage(error));
        return false;
      }
      toast.error(errorMessage(error));
      return false;
    }
  }

  function changeQuantity(key: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => (line.key === key ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  function addLine(line: CartLine) {
    setCart((current) => {
      const match = current.findIndex(
        (candidate) =>
          candidate.itemId === line.itemId &&
          (candidate.variantId ?? '') === (line.variantId ?? '') &&
          candidate.note === line.note &&
          candidate.modifierOptionIds.length === line.modifierOptionIds.length &&
          candidate.modifierOptionIds.every((id) => line.modifierOptionIds.includes(id)),
      );
      if (match >= 0) {
        return current.map((candidate, index) =>
          index === match ? { ...candidate, quantity: candidate.quantity + line.quantity } : candidate,
        );
      }
      return [...current, line];
    });
    setJustAdded(line.itemId);
  }

  function quickAdd(item: PublicItem) {
    if (item.soldOut) return;
    if (item.variants.length > 0 || item.modifierGroups.length > 0) {
      setDetail(item);
      return;
    }
    addLine({
      key: `${item.id}-base-${Date.now()}`,
      itemId: item.id,
      name: item.name,
      basePrice: item.basePrice,
      variantDelta: '0',
      modifierOptionIds: [],
      modifierNames: [],
      modifiersTotal: '0.00',
      quantity: 1,
    });
    toast.success(`Added · ${item.name}`);
  }

  async function submitOrder() {
    if (cart.length === 0) return;
    if (!(await ensureSession())) return;
    setSubmitting(true);
    try {
      const order = await clientApi<{ id: string; number: string; total: string }>(
        '/public/customer-session/orders',
        {
          method: 'POST',
          idempotencyKey: idempotencyRef.current,
          body: {
            items: cart.map((line) => ({
              menuItemId: line.itemId,
              ...(line.variantId ? { variantId: line.variantId } : {}),
              quantity: line.quantity,
              ...(line.modifierOptionIds.length > 0 ? { modifierOptionIds: line.modifierOptionIds } : {}),
              ...(line.note ? { note: line.note } : {}),
            })),
            ...(promoCode.trim() ? { promotionCode: promoCode.trim().toUpperCase() } : {}),
            note: undefined,
          },
        },
      );
      idempotencyRef.current = `ord-${Math.random().toString(36).slice(2)}`;
      setCart([]);
      setPromoCode('');
      sessionStorage.removeItem(`tt-cart-${token}`);
      setLastOrderId(order.id);
      setCartOpen(false);
      setView('orders');
      toast.success(`Order ${order.number} sent to the kitchen`);
      await refreshSession();
      const fresh = await clientApi<{ menu: PublicCategory[] }>('/public/customer-session/menu');
      setMenu(fresh.menu);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function request(type: 'CALL_WAITER' | 'REQUEST_WATER' | 'REQUEST_UTENSILS' | 'REQUEST_BILL') {
    if (!(await ensureSession())) return;
    setRequestBusy(true);
    try {
      await clientApi('/public/customer-session/requests', { method: 'POST', body: { type } });
      toast.success(
        type === 'REQUEST_BILL'
          ? 'Bill requested — staff will bring it shortly'
          : type === 'CALL_WAITER'
            ? 'A team member is on the way'
            : 'Request sent',
      );
      await refreshSession();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRequestBusy(false);
    }
  }

  const filteredMenu = React.useMemo(() => {
    if (!search.trim()) return menu;
    const needle = search.trim().toLowerCase();
    return menu
      .map((category) => ({
        ...category,
        items: category.items.filter((item) =>
          `${item.name} ${item.nameEn ?? ''} ${item.descriptionEn ?? ''} ${item.description ?? ''}`
            .toLowerCase()
            .includes(needle),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [menu, search]);

  // Keep the category tabs in sync with what is on screen.
  React.useEffect(() => {
    if (view !== 'menu' || search) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-category]'));
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.getAttribute('data-category');
        if (id) setActiveCategory(id);
      },
      { rootMargin: '-120px 0px -65% 0px', threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [view, search, filteredMenu]);

  const cartCount = cart.reduce((acc, line) => acc + line.quantity, 0);
  const cartTotal = cart.reduce((acc, line) => acc + estimateLine(line), 0);
  const cartQuantity = (itemId: string) =>
    cart.filter((line) => line.itemId === itemId).reduce((acc, line) => acc + line.quantity, 0);
  const activeOrders =
    session?.orders.filter((order) => !['SERVED', 'CANCELLED'].includes(order.status)) ?? [];
  const latestOrder = session?.orders[session.orders.length - 1];

  function goToCategory(id: string) {
    setActiveCategory(id);
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="bg-night text-[#f3ede2]">
        <div className="mx-auto w-full max-w-6xl px-5 pb-5 pt-5 lg:px-8 lg:pb-8 lg:pt-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[9.5px] uppercase tracking-[0.22em] text-[#8f8574]">{restaurant.branch}</p>
              <h1 className="mt-2 font-display text-[36px] leading-[0.95] text-white lg:text-[46px]">
                {restaurant.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[#a49a88]">
                <span className="border border-[#6d5a2f] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-[#d8b978]">
                  Dine in
                </span>
                <span className="money text-[12px] text-[#e9e3d6]">Table {table.number}</span>
                {table.name ? <span className="truncate">{table.name}</span> : null}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end">
              <div className="flex border border-[#3a3327]" role="tablist" aria-label="Guest menu sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'menu'}
                  onClick={() => setView('menu')}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 border-r border-[#3a3327] px-2.5 text-[10.5px] font-medium transition-colors',
                    view === 'menu'
                      ? 'bg-[#221d15] text-white'
                      : 'text-[#c9c0ad] hover:bg-[#1c1812] hover:text-white',
                  )}
                >
                  <Utensils className="h-3 w-3" /> Menu
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'orders'}
                  onClick={async () => {
                    await ensureSession();
                    setView('orders');
                    void refreshSession();
                  }}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 px-2.5 text-[10.5px] font-medium transition-colors',
                    view === 'orders'
                      ? 'bg-[#221d15] text-white'
                      : 'text-[#c9c0ad] hover:bg-[#1c1812] hover:text-white',
                  )}
                >
                  <Clock className="h-3 w-3" /> Orders
                  {session && session.orders.length > 0 ? (
                    <span
                      className={cn(
                        'ml-0.5 min-w-4 rounded-sm px-1 text-[9px] font-semibold tabular',
                        activeOrders.length > 0 ? 'bg-[#d8b978] text-night' : 'bg-[#2e2920] text-[#a49a88]',
                      )}
                    >
                      {session.orders.length}
                    </span>
                  ) : null}
                </button>
              </div>
              <button
                type="button"
                onClick={() => request('CALL_WAITER')}
                disabled={requestBusy}
                className="inline-flex h-8 items-center gap-1.5 border border-[#3a3327] px-2.5 text-[10.5px] font-medium text-[#c9c0ad] transition-colors hover:border-[#6d5a2f] hover:text-white disabled:opacity-50"
              >
                <BellRing className="h-3 w-3" /> Call waiter
              </button>
            </div>
          </div>
        </div>
        <div className="h-px bg-[#6d5a2f]" />
      </header>

      <div className="mx-auto w-full max-w-6xl px-0 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10 lg:px-8">
        <div className="min-w-0">
          {view === 'menu' ? (
            <>
              <div className="sticky top-0 z-30 border-b border-line bg-paper px-5 pt-3 lg:px-0">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-0 top-2.5 h-3.5 w-3.5 text-muted-soft" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search dishes, drinks, allergies…"
                    aria-label="Search the menu"
                    className="h-9 w-full border-0 border-b border-line bg-transparent pl-6 pr-8 text-[13px] text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-0"
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Clear search"
                      className="absolute right-0 top-1.5 p-1 text-muted hover:text-ink"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                {!search ? (
                  <div className="mt-1 flex gap-5 overflow-x-auto pr-10 scrollbar-thin [mask-image:linear-gradient(to_right,black_88%,transparent)]">
                    {menu.map((category) => {
                      const active = activeCategory === category.id;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => goToCategory(category.id)}
                          aria-current={active ? 'true' : undefined}
                          className={cn(
                            'shrink-0 border-b-2 pb-1.5 pt-1 text-[12px] transition-colors',
                            active
                              ? 'border-ink font-semibold text-ink'
                              : 'border-transparent font-medium text-muted hover:text-ink',
                          )}
                        >
                          {category.name}
                          <span className="ml-1.5 text-[9.5px] tabular text-muted-soft">
                            {category.items.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <main className="px-5 pb-28 pt-4 lg:px-0 lg:pb-16 lg:pt-5">
                {filteredMenu.length === 0 ? (
                  <div className="mt-10 border border-dashed border-line-strong px-6 py-12 text-center">
                    <p className="font-display text-[20px] text-ink">No dishes match “{search}”</p>
                    <p className="mt-1 text-[12px] text-muted">Try another word, or see the full menu.</p>
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="mt-4 inline-flex h-9 items-center gap-1.5 border border-ink px-4 text-[12px] font-medium text-ink hover:bg-ink hover:text-paper"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="space-y-11">
                    {filteredMenu.map((category) => (
                      <section
                        key={category.id}
                        id={`cat-${category.id}`}
                        data-category={category.id}
                        className="scroll-mt-[124px]"
                      >
                        <div className="flex items-end justify-between gap-4 border-b border-line pb-2">
                          <div>
                            <h2 className="font-display text-[23px] leading-none text-ink lg:text-[26px]">
                              {category.name}
                            </h2>
                            {category.nameEn ? (
                              <p className="mt-1.5 text-[9.5px] uppercase tracking-[0.16em] text-muted-soft">
                                {category.nameEn}
                              </p>
                            ) : null}
                          </div>
                          <span className="shrink-0 text-[10.5px] text-muted">
                            {category.items.length} dishes
                          </span>
                        </div>

                        {category.items.map((item) => {
                          const added = justAdded === item.id;
                          return (
                            <div
                              key={item.id}
                              className={cn(
                                'flex items-start gap-4 border-b border-line py-4 transition-colors',
                                item.soldOut ? 'opacity-55' : 'hover:bg-surface/60',
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => !item.soldOut && setDetail(item)}
                                disabled={item.soldOut}
                                className="min-w-0 flex-1 text-left disabled:cursor-default"
                              >
                                <div className="flex items-baseline justify-between gap-4">
                                  <p className="min-w-0 font-display text-[18px] leading-tight text-ink lg:text-[19px]">
                                    {item.name}
                                  </p>
                                  <span
                                    className={cn(
                                      'money shrink-0 text-[13px] text-ink',
                                      item.soldOut && 'text-muted line-through',
                                    )}
                                  >
                                    {formatTHB(item.basePrice)}
                                  </span>
                                </div>
                                {item.nameEn ? (
                                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-soft">
                                    {item.nameEn}
                                  </p>
                                ) : null}
                                <p className="mt-1.5 line-clamp-2 max-w-[52ch] text-[11.5px] leading-relaxed text-muted">
                                  {item.descriptionEn ?? item.description}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] uppercase tracking-[0.13em] text-muted-soft">
                                  {item.soldOut ? (
                                    <span className="font-semibold text-danger">Sold out</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1">
                                      <Clock className="h-2.5 w-2.5" /> {item.prepMinutes} min
                                    </span>
                                  )}
                                  {item.isPopular ? (
                                    <span className="inline-flex items-center gap-1 text-brand">
                                      <Flame className="h-2.5 w-2.5" /> popular
                                    </span>
                                  ) : null}
                                  {item.isFeatured ? (
                                    <span className="inline-flex items-center gap-1 text-gold">
                                      <Sparkles className="h-2.5 w-2.5" /> chef&apos;s pick
                                    </span>
                                  ) : null}
                                  {item.allergens.length > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-warning">
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      {item.allergens.map((allergen) => allergen.name).join(', ')}
                                    </span>
                                  ) : null}
                                  {item.variants.length > 0 || item.modifierGroups.length > 0 ? (
                                    <span>choices</span>
                                  ) : null}
                                </div>
                              </button>

                              <div className="flex w-10 shrink-0 items-start justify-end pt-0.5 lg:w-8">
                                <button
                                  type="button"
                                  onClick={() => quickAdd(item)}
                                  disabled={item.soldOut}
                                  aria-label={`Add ${item.name} to the order`}
                                  className={cn(
                                    'relative grid h-10 w-10 place-items-center border transition-colors duration-150 lg:h-8 lg:w-8',
                                    item.soldOut
                                      ? 'border-line text-muted-soft'
                                      : added
                                        ? 'border-success bg-success text-white'
                                        : cartQuantity(item.id) > 0
                                          ? 'border-ink text-ink hover:bg-ink hover:text-paper'
                                          : 'border-line-strong text-ink hover:border-ink hover:bg-ink hover:text-paper',
                                  )}
                                >
                                  {added ? (
                                    <Check className="h-3.5 w-3.5" />
                                  ) : (
                                    <Plus className="h-3.5 w-3.5" />
                                  )}
                                  {!added && cartQuantity(item.id) > 0 ? (
                                    <span className="absolute -left-1.5 -top-1.5 grid h-4 min-w-4 place-items-center bg-brand px-1 text-[9px] font-semibold leading-none text-white tabular">
                                      {cartQuantity(item.id)}
                                    </span>
                                  ) : null}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </section>
                    ))}
                  </div>
                )}

                <div className="mt-12 border-t border-line pt-5">
                  <p className="text-[9.5px] uppercase tracking-[0.16em] text-muted-soft">At your table</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <RequestButton busy={requestBusy} onClick={() => request('REQUEST_WATER')}>
                      ขอน้ำเพิ่ม / Water
                    </RequestButton>
                    <RequestButton busy={requestBusy} onClick={() => request('REQUEST_UTENSILS')}>
                      ขอช้อนส้อม / Utensils
                    </RequestButton>
                    <RequestButton busy={requestBusy} onClick={() => request('REQUEST_BILL')}>
                      เก็บเงิน / Bill
                    </RequestButton>
                  </div>
                  <p className="mt-5 max-w-[60ch] text-[10.5px] leading-relaxed text-muted">
                    Prices include VAT where applicable. A service charge may be added at the bill. Adding a
                    dish once is enough — repeated taps cannot create duplicates.
                  </p>
                </div>
              </main>
            </>
          ) : (
            <OrdersView
              session={session}
              lastOrderId={lastOrderId}
              requestBusy={requestBusy}
              payBusy={payBusy}
              onPay={startPromptPay}
              onRequestBill={() => request('REQUEST_BILL')}
              onBrowse={() => setView('menu')}
            />
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-4 pt-6">
            <TableRail
              table={table}
              cart={cart}
              cartCount={cartCount}
              cartTotal={cartTotal}
              submitting={submitting}
              requestBusy={requestBusy}
              bill={session?.bill ?? null}
              activeOrders={activeOrders}
              latestOrder={latestOrder}
              payBusy={payBusy}
              onPay={startPromptPay}
              onReview={() => setCartOpen(true)}
              onRequest={request}
              onViewOrders={async () => {
                await ensureSession();
                setView('orders');
                void refreshSession();
              }}
            />
          </div>
        </aside>
      </div>

      {cartCount > 0 && view === 'menu' ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-[9.5px] uppercase tracking-[0.14em] text-muted">
                {cartCount} {cartCount === 1 ? 'item' : 'items'} in your order
              </p>
              <p className="money text-[18px] leading-tight text-ink">{formatTHB(cartTotal)}</p>
            </div>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="inline-flex h-11 items-center gap-2 bg-ink px-5 text-[13px] font-semibold text-paper transition-colors hover:bg-ink-soft"
            >
              <ShoppingBag className="h-4 w-4" /> Review order
            </button>
          </div>
        </div>
      ) : null}

      {detail ? (
        <ItemSheet
          item={detail}
          onClose={() => setDetail(null)}
          onAdd={(line) => {
            addLine(line);
            setDetail(null);
            toast.success(`Added · ${line.name}`);
          }}
        />
      ) : null}

      {cartOpen ? (
        <CartSheet
          tableNumber={table.number}
          cart={cart}
          cartTotal={cartTotal}
          promoCode={promoCode}
          onPromoChange={setPromoCode}
          submitting={submitting}
          onClose={() => setCartOpen(false)}
          onChange={changeQuantity}
          onClear={() => setCart([])}
          onSubmit={submitOrder}
        />
      ) : null}

      {pay ? (
        <PromptPaySheet pay={pay} onClose={() => setPay(null)} onCheck={() => void refreshSession()} />
      ) : null}
    </div>
  );
}

function RequestButton({
  busy,
  onClick,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="border border-line-strong px-3 py-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Progress({ status }: { status: string }) {
  if (status === 'CANCELLED') return null;
  const index = Math.max(0, ORDER_STEPS.indexOf(status as (typeof ORDER_STEPS)[number]));
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {ORDER_STEPS.map((step, stepIndex) => (
        <span key={step} className={cn('h-[3px] w-5', stepIndex <= index ? 'bg-brand' : 'bg-line')} />
      ))}
    </div>
  );
}

function TableRail({
  table,
  cart,
  cartCount,
  cartTotal,
  submitting,
  requestBusy,
  bill,
  activeOrders,
  latestOrder,
  payBusy,
  onPay,
  onReview,
  onRequest,
  onViewOrders,
}: {
  table: { number: string; name: string | null };
  cart: CartLine[];
  cartCount: number;
  cartTotal: number;
  submitting: boolean;
  requestBusy: boolean;
  bill: SessionState['bill'] | null;
  activeOrders: SessionOrder[];
  latestOrder?: SessionOrder;
  payBusy: boolean;
  onPay: () => void;
  onReview: () => void;
  onRequest: (type: 'CALL_WAITER' | 'REQUEST_WATER' | 'REQUEST_UTENSILS' | 'REQUEST_BILL') => void;
  onViewOrders: () => void;
}) {
  return (
    <>
      <section className="border border-line bg-surface-raised">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] text-muted-soft">Your table</p>
            <p className="mt-0.5 font-display text-[21px] leading-none text-ink">Table {table.number}</p>
            {table.name ? <p className="mt-1 text-[10.5px] text-muted">{table.name}</p> : null}
          </div>
          <span className="border border-line px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.14em] text-muted">
            Dine in
          </span>
        </header>

        <div className="px-4 py-3">
          <div className="flex items-baseline justify-between">
            <p className="text-[9px] uppercase tracking-[0.16em] text-muted-soft">Your order</p>
            {cartCount > 0 ? (
              <span className="text-[10px] tabular text-muted">
                {cartCount} {cartCount === 1 ? 'item' : 'items'}
              </span>
            ) : null}
          </div>

          {cart.length === 0 ? (
            <p className="mt-2 max-w-[30ch] text-[11.5px] leading-relaxed text-muted">
              Nothing added yet. Choose a dish and it will appear here with the running total.
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-line/70">
              {cart.slice(0, 4).map((line) => (
                <li key={line.key} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] font-medium text-ink">
                      {line.quantity} × {line.name}
                    </p>
                    {lineOptionSummary(line) ? (
                      <p className="truncate text-[10px] text-muted">{lineOptionSummary(line)}</p>
                    ) : null}
                    {line.note ? <p className="truncate text-[10px] text-gold">{line.note}</p> : null}
                  </div>
                  <span className="money shrink-0 text-[11px] text-ink-soft">
                    {formatTHB(estimateLine(line))}
                  </span>
                </li>
              ))}
              {cart.length > 4 ? (
                <li className="py-1.5 text-[10px] text-muted">
                  and {cart.length - 4} more line(s) — open the order to edit
                </li>
              ) : null}
            </ul>
          )}

          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2.5">
            <span className="text-[10.5px] text-muted">Subtotal</span>
            <span className="money text-[15px] text-ink">{formatTHB(cartTotal)}</span>
          </div>

          <button
            type="button"
            onClick={onReview}
            disabled={cartCount === 0 || submitting}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 bg-ink text-[12.5px] font-semibold text-paper transition-colors hover:bg-ink-soft disabled:border disabled:border-line disabled:bg-transparent disabled:text-muted-soft"
          >
            <ShoppingBag className="h-3.5 w-3.5" /> Review order
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="border-t border-line px-4 py-3">
          <p className="text-[9px] uppercase tracking-[0.16em] text-muted-soft">Ask the floor</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onRequest('CALL_WAITER')}
              disabled={requestBusy}
              className="col-span-2 inline-flex h-8 items-center justify-center gap-1.5 border border-line-strong text-[11px] font-medium text-ink transition-colors hover:border-ink disabled:opacity-50"
            >
              <BellRing className="h-3 w-3" /> Call waiter
            </button>
            <button
              type="button"
              onClick={() => onRequest('REQUEST_WATER')}
              disabled={requestBusy}
              className="inline-flex h-8 items-center justify-center border border-line text-[10.5px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              Water
            </button>
            <button
              type="button"
              onClick={() => onRequest('REQUEST_UTENSILS')}
              disabled={requestBusy}
              className="inline-flex h-8 items-center justify-center border border-line text-[10.5px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              Utensils
            </button>
            <button
              type="button"
              onClick={() => onRequest('REQUEST_BILL')}
              disabled={requestBusy}
              className="col-span-2 inline-flex h-8 items-center justify-center gap-1.5 border border-line text-[10.5px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              <Receipt className="h-3 w-3" /> Request the bill
            </button>
          </div>
        </div>
      </section>

      {bill ? (
        <section className="border border-gold/40 bg-gold-soft/50 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] text-gold">Bill issued</p>
              <p className="money mt-0.5 text-[11px] text-ink-soft">{bill.number}</p>
            </div>
            <p className="money text-[16px] text-ink">{formatTHB(bill.due)}</p>
          </div>
          {Number(bill.due) > 0 ? (
            <>
              <button
                type="button"
                onClick={onPay}
                disabled={payBusy}
                className="mt-3 inline-flex h-9 items-center gap-1.5 bg-ink px-4 text-[11.5px] font-semibold text-paper transition-colors hover:bg-ink-soft disabled:opacity-60"
              >
                <QrCode className="h-3.5 w-3.5" /> Pay with PromptPay
              </button>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-gold">
                Scan the QR with a banking app, or settle with staff.
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-[10.5px] font-medium text-success">Paid in full — thank you.</p>
          )}
        </section>
      ) : null}

      {latestOrder ? (
        <section className="border border-line bg-surface-raised px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] text-muted-soft">
                {activeOrders.length > 0 ? 'In progress' : 'Last order'}
              </p>
              <p className="mt-0.5 text-[11.5px] font-medium text-ink">
                {ORDER_LABEL[latestOrder.status] ?? latestOrder.status}
              </p>
              <p className="text-[10px] text-muted">
                {latestOrder.number} · {formatTime(latestOrder.createdAt)}
              </p>
            </div>
            <Progress status={latestOrder.status} />
          </div>
          <button
            type="button"
            onClick={onViewOrders}
            className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-medium text-brand hover:underline"
          >
            Track every order <ChevronRight className="h-3 w-3" />
          </button>
        </section>
      ) : null}
    </>
  );
}

function OrdersView({
  session,
  lastOrderId,
  requestBusy,
  payBusy,
  onPay,
  onRequestBill,
  onBrowse,
}: {
  session: SessionState | null;
  lastOrderId: string | null;
  requestBusy: boolean;
  payBusy: boolean;
  onPay: () => void;
  onRequestBill: () => void;
  onBrowse: () => void;
}) {
  return (
    <main className="px-5 pb-24 pt-6 lg:px-0 lg:pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-2.5">
        <div>
          <h2 className="font-display text-[25px] leading-none text-ink">Your table</h2>
          <p className="mt-1.5 text-[11px] text-muted">
            {session && session.orders.length > 0
              ? `${session.orders.length} ${session.orders.length === 1 ? 'order' : 'orders'} · live kitchen progress`
              : 'Orders you send appear here with live kitchen progress.'}
          </p>
        </div>
        {session && session.orders.length > 0 ? (
          <button
            type="button"
            onClick={onRequestBill}
            disabled={requestBusy}
            className="inline-flex h-9 items-center gap-1.5 bg-ink px-4 text-[11.5px] font-semibold text-paper transition-colors hover:bg-ink-soft disabled:opacity-50"
          >
            <Receipt className="h-3.5 w-3.5" /> Request bill
          </button>
        ) : null}
      </div>

      {!session || session.orders.length === 0 ? (
        <div className="mt-8 border border-dashed border-line-strong px-6 py-12 text-center">
          <ShoppingBag className="mx-auto h-6 w-6 text-muted-soft" />
          <p className="mt-3 font-display text-[20px] text-ink">No orders yet</p>
          <p className="mx-auto mt-1 max-w-[38ch] text-[11.5px] leading-relaxed text-muted">
            Send your first order and watch it move from the pass to your table, one line at a time.
          </p>
          <button
            type="button"
            onClick={onBrowse}
            className="mt-5 inline-flex h-9 items-center gap-1.5 bg-ink px-4 text-[12px] font-medium text-paper hover:bg-ink-soft"
          >
            Browse the menu <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {session.bill ? (
            <section className="border border-gold/40 bg-gold-soft/50 px-4 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.16em] text-gold">Bill issued</p>
                  <p className="money mt-0.5 text-[11.5px] text-ink-soft">{session.bill.number}</p>
                  <p className="mt-0.5 text-[10.5px] text-gold">
                    {session.bill.status.replace(/_/g, ' ').toLowerCase()} · settle with staff
                  </p>
                </div>
                <p className="money text-[19px] text-ink">{formatTHB(session.bill.due)}</p>
              </div>
              {Number(session.bill.due) > 0 ? (
                <button
                  type="button"
                  onClick={onPay}
                  disabled={payBusy}
                  className="mt-3 inline-flex h-9 items-center gap-1.5 bg-ink px-4 text-[11.5px] font-semibold text-paper transition-colors hover:bg-ink-soft disabled:opacity-60"
                >
                  <QrCode className="h-3.5 w-3.5" /> Pay with PromptPay
                </button>
              ) : (
                <p className="mt-2 text-[10.5px] font-medium text-success">Paid in full — thank you.</p>
              )}
            </section>
          ) : null}

          {session.orders.map((order) => {
            const isLatest = order.id === lastOrderId;
            return (
              <article
                key={order.id}
                className={cn('border bg-surface-raised', isLatest ? 'border-brand/40' : 'border-line')}
              >
                <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-0">
                    <p className="money whitespace-nowrap text-[11.5px] font-medium text-ink">
                      {order.number}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted">
                      {isLatest ? (
                        <span className="font-semibold uppercase tracking-[0.1em] text-brand">just sent</span>
                      ) : null}
                      <span>{formatTime(order.createdAt)}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {order.items.length} {order.items.length === 1 ? 'line' : 'lines'}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{agoLabel(order.createdAt)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span
                      className={cn(
                        'border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]',
                        order.status === 'CANCELLED'
                          ? 'border-danger/30 bg-danger-soft text-danger'
                          : order.status === 'SERVED'
                            ? 'border-line bg-paper-deep text-muted'
                            : order.status === 'READY'
                              ? 'border-success/30 bg-success-soft text-success'
                              : 'border-gold/30 bg-gold-soft text-gold',
                      )}
                    >
                      {ORDER_LABEL[order.status] ?? order.status.toLowerCase()}
                    </span>
                    <Progress status={order.status} />
                  </div>
                </header>

                <ul className="divide-y divide-line/60 px-4">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[12px] text-ink">
                          <span className="money mr-1.5 text-[11px] text-muted">{item.quantity}×</span>
                          <span className="font-medium">{item.name}</span>
                        </p>
                        {item.modifiers.length > 0 ? (
                          <p className="mt-0.5 text-[10.5px] text-muted">
                            {item.modifiers.map((modifier) => modifier.name).join(' · ')}
                          </p>
                        ) : null}
                        {item.note ? <p className="mt-0.5 text-[10.5px] text-gold">{item.note}</p> : null}
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-[8.5px] font-semibold uppercase tracking-[0.12em]',
                          item.status === 'READY' || item.status === 'SERVED'
                            ? 'text-success'
                            : item.status === 'PENDING'
                              ? 'text-muted-soft'
                              : 'text-gold',
                        )}
                      >
                        {item.status.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>

                <footer className="flex items-center justify-between border-t border-line px-4 py-2.5">
                  <span className="text-[10.5px] text-muted">Order total</span>
                  <span className="money text-[13px] text-ink">{formatTHB(order.total)}</span>
                </footer>
              </article>
            );
          })}

          <div className="flex items-center justify-between border border-line bg-paper-deep/40 px-4 py-3">
            <span className="text-[11px] text-muted">Running total, before the final bill</span>
            <span className="money text-[15px] text-ink">{formatTHB(session.orderTotal)}</span>
          </div>

          <button
            type="button"
            onClick={onBrowse}
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add more dishes
          </button>
        </div>
      )}
    </main>
  );
}

function formatTarget(value: string | null): string {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 13) {
    return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value;
}

function PromptPaySheet({
  pay,
  onClose,
  onCheck,
}: {
  pay: GuestPayment;
  onClose: () => void;
  onCheck: () => void;
}) {
  useDismiss(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <button
        type="button"
        aria-label="Close payment"
        className="absolute inset-0 animate-fade bg-night/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pay with PromptPay"
        className="relative max-h-[92vh] w-full max-w-md animate-slide-up overflow-y-auto border-t border-line bg-surface-raised p-5 scrollbar-thin lg:animate-scale-in lg:border"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] text-muted-soft">PromptPay</p>
            <h2 className="mt-0.5 font-display text-[26px] leading-none text-ink">
              Pay {formatTHB(pay.amount)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="mt-4 flex flex-col items-center">
          <img src={pay.qrDataUrl} alt="PromptPay QR" className="h-60 w-60 border border-line bg-white p-2" />
          <p className="mt-3 text-[9px] uppercase tracking-[0.16em] text-muted-soft">Account</p>
          <p className="text-[13px] font-medium text-ink">{pay.accountName ?? 'PromptPay'}</p>
          <p className="money text-[11px] text-ink-soft">{formatTarget(pay.promptPayTarget)}</p>
        </div>

        <ol className="mt-4 space-y-1 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
          <li>1. Open any Thai banking app.</li>
          <li>2. Scan the QR and confirm {formatTHB(pay.amount)}.</li>
          <li>3. A team member confirms receipt; this screen updates by itself.</li>
        </ol>
        <p className="mt-2 font-mono text-[9.5px] text-muted-soft">Ref {pay.reference}</p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCheck}
            className="h-10 flex-1 bg-ink text-[12px] font-semibold text-paper transition-colors hover:bg-ink-soft"
          >
            Check again
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 border border-line px-4 text-[12px] text-ink-soft"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CartSheet({
  tableNumber,
  cart,
  cartTotal,
  promoCode,
  onPromoChange,
  submitting,
  onClose,
  onChange,
  onClear,
  onSubmit,
}: {
  tableNumber: string;
  cart: CartLine[];
  cartTotal: number;
  promoCode: string;
  onPromoChange: (value: string) => void;
  submitting: boolean;
  onClose: () => void;
  onChange: (key: string, delta: number) => void;
  onClear: () => void;
  onSubmit: () => void;
}) {
  useDismiss(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <button
        type="button"
        aria-label="Close order"
        className="absolute inset-0 animate-fade bg-night/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your order"
        className="relative max-h-[90vh] w-full max-w-lg animate-slide-up overflow-y-auto border-t border-line bg-surface-raised scrollbar-thin lg:max-h-[85vh] lg:animate-scale-in lg:border"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface-raised px-5 py-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] text-muted-soft">
              Table service · Table {tableNumber}
            </p>
            <h2 className="mt-0.5 font-display text-[24px] leading-none text-ink">Your order</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted transition-colors hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-3">
          {cart.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-display text-[19px] text-ink">Your order is empty</p>
              <p className="mt-1 text-[11.5px] text-muted">Close this panel and pick a dish.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {cart.map((line) => (
                <li key={line.key} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[16px] leading-tight text-ink">{line.name}</p>
                      {lineOptionSummary(line) ? (
                        <p className="mt-0.5 text-[10.5px] text-muted">{lineOptionSummary(line)}</p>
                      ) : null}
                      {line.note ? <p className="mt-0.5 text-[10.5px] text-gold">{line.note}</p> : null}
                    </div>
                    <span className="money shrink-0 text-[13px] text-ink">
                      {formatTHB(estimateLine(line))}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center border border-line-strong">
                      <button
                        type="button"
                        onClick={() => onChange(line.key, -1)}
                        className="grid h-9 w-9 place-items-center text-muted transition-colors hover:bg-paper-deep hover:text-ink lg:h-7 lg:w-7"
                        aria-label={`Remove one ${line.name}`}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-[12px] font-semibold tabular text-ink">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onChange(line.key, 1)}
                        className="grid h-9 w-9 place-items-center text-muted transition-colors hover:bg-paper-deep hover:text-ink lg:h-7 lg:w-7"
                        aria-label={`Add one ${line.name}`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    {line.quantity > 1 ? (
                      <span className="text-[10px] text-muted-soft tabular">
                        {formatTHB(
                          (
                            Number(line.basePrice) +
                            Number(line.variantDelta) +
                            Number(line.modifiersTotal)
                          ).toFixed(2),
                        )}{' '}
                        each
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 pb-5">
          <div className="mb-3 border-t border-line pt-3">
            <label
              htmlFor="promo-code"
              className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-soft"
            >
              Promotion code
            </label>
            <input
              id="promo-code"
              value={promoCode}
              onChange={(event) => onPromoChange(event.target.value.toUpperCase())}
              placeholder="Optional"
              autoComplete="off"
              className="mt-1 h-9 w-full border border-line bg-paper/60 px-2.5 font-mono text-[12px] uppercase tracking-[0.08em] text-ink placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-soft focus:border-ink focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-muted">
              Applied when the order is priced. Invalid or expired codes are refused; nothing is charged.
            </p>
          </div>

          <dl className="space-y-1 border-t border-line pt-3 text-[12px]">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="money text-ink">{formatTHB(cartTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Service charge & VAT</dt>
              <dd className="text-muted">Calculated on the server</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="text-[12px] font-semibold text-ink">Estimated total</dt>
              <dd className="money text-[17px] text-ink">{formatTHB(cartTotal)}</dd>
            </div>
          </dl>

          <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
            The exact total including any service charge appears on the final bill. Sending once is enough —
            repeated taps cannot create duplicates.
          </p>

          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || cart.length === 0}
            className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 bg-ink text-[13.5px] font-semibold text-paper transition-colors hover:bg-ink-soft disabled:opacity-60"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper border-t-transparent" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Send to kitchen · {formatTHB(cartTotal)}
          </button>

          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-medium text-ink-soft hover:text-ink"
            >
              Add more dishes
            </button>
            {cart.length > 0 ? (
              <button type="button" onClick={onClear} className="text-[10.5px] text-muted hover:text-danger">
                Clear the order
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemSheet({
  item,
  onClose,
  onAdd,
}: {
  item: PublicItem;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const [variantId, setVariantId] = React.useState<string | undefined>(
    item.variants.find((variant) => variant.isDefault)?.id ?? item.variants[0]?.id,
  );
  const [selected, setSelected] = React.useState<Record<string, string[]>>({});
  const [note, setNote] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [error, setError] = React.useState<string | null>(null);

  useDismiss(true, onClose);

  const variant = item.variants.find((candidate) => candidate.id === variantId);
  const selectedOptions = item.modifierGroups.flatMap((group) =>
    (selected[group.id] ?? []).map((optionId) => ({
      group,
      option: group.options.find((option) => option.id === optionId)!,
    })),
  );
  const unitPrice =
    Number(item.basePrice) +
    Number(variant?.priceDelta ?? 0) +
    selectedOptions.reduce((acc, entry) => acc + Number(entry.option.priceDelta), 0);

  function toggle(group: PublicGroup, optionId: string) {
    setError(null);
    setSelected((current) => {
      const existing = current[group.id] ?? [];
      if (existing.includes(optionId)) {
        return { ...current, [group.id]: existing.filter((id) => id !== optionId) };
      }
      if (group.maxSelect === 1) return { ...current, [group.id]: [optionId] };
      if (existing.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...existing, optionId] };
    });
  }

  function add() {
    for (const group of item.modifierGroups) {
      const count = (selected[group.id] ?? []).length;
      if (group.required && count < Math.max(1, group.minSelect)) {
        setError(`Choose ${group.name}`);
        return;
      }
      if (count < group.minSelect) {
        setError(`Choose at least ${group.minSelect} in ${group.name}`);
        return;
      }
    }
    setError(null);
    onAdd({
      key: `${item.id}-${variantId ?? 'base'}-${JSON.stringify(selected)}-${Date.now()}`,
      itemId: item.id,
      name: item.name,
      basePrice: item.basePrice,
      variantId,
      variantName: variant?.name,
      variantDelta: variant?.priceDelta ?? '0',
      modifierOptionIds: selectedOptions.map((entry) => entry.option.id),
      modifierNames: selectedOptions.map((entry) => entry.option.name),
      modifiersTotal: selectedOptions
        .reduce((acc, entry) => acc + Number(entry.option.priceDelta), 0)
        .toFixed(2),
      note: note.trim() || undefined,
      quantity,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <button
        type="button"
        aria-label="Close dish"
        className="absolute inset-0 animate-fade bg-night/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="relative flex max-h-[92vh] w-full max-w-lg animate-slide-up flex-col border-t border-line bg-surface-raised lg:max-h-[88vh] lg:animate-scale-in lg:border"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.18em] text-muted-soft">{item.nameEn ?? 'Menu'}</p>
            <h2 className="mt-1 font-display text-[26px] leading-none text-ink">{item.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 text-muted transition-colors hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          <p className="money text-[15px] text-ink">{formatTHB(item.basePrice)}</p>
          {item.description ? (
            <p className="mt-2 max-w-[54ch] text-[12px] leading-relaxed text-muted">{item.description}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] uppercase tracking-[0.13em] text-muted-soft">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> {item.prepMinutes} min
            </span>
            {item.isPopular ? (
              <span className="inline-flex items-center gap-1 text-brand">
                <Flame className="h-2.5 w-2.5" /> popular
              </span>
            ) : null}
          </div>

          {item.allergens.length > 0 ? (
            <div className="mt-3 flex items-start gap-2 border border-warning/30 bg-warning-soft px-2.5 py-2 text-[10.5px] leading-relaxed text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Contains {item.allergens.map((allergen) => allergen.name).join(', ')}</span>
            </div>
          ) : null}

          {item.variants.length > 0 ? (
            <fieldset className="mt-5">
              <legend className="mb-2 flex w-full items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
                  Size / option
                </span>
                <span className="text-[10px] text-muted">Required</span>
              </legend>
              <div className="grid gap-1.5">
                {item.variants.map((candidate) => {
                  const active = variantId === candidate.id;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setVariantId(candidate.id)}
                      aria-pressed={active}
                      className={cn(
                        'flex items-center justify-between border px-3 py-2 text-left text-[12px] transition-colors',
                        active
                          ? 'border-ink bg-paper-deep/60 text-ink'
                          : 'border-line text-ink-soft hover:border-line-strong',
                      )}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={cn(
                            'grid h-3.5 w-3.5 place-items-center rounded-full border',
                            active ? 'border-ink bg-ink text-paper' : 'border-line-strong',
                          )}
                        >
                          {active ? <Check className="h-2 w-2" /> : null}
                        </span>
                        {candidate.name}
                      </span>
                      {Number(candidate.priceDelta) !== 0 ? (
                        <span className="money text-[11px] text-muted">
                          +{formatTHB(candidate.priceDelta)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {item.modifierGroups.map((group) => (
            <fieldset key={group.id} className="mt-5">
              <legend className="mb-2 flex w-full items-baseline justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
                  {group.name}
                </span>
                <span
                  className={cn(
                    'text-[10px]',
                    group.required && (selected[group.id] ?? []).length < Math.max(1, group.minSelect)
                      ? 'font-medium text-brand'
                      : 'text-muted',
                  )}
                >
                  {group.required ? 'Required' : 'Optional'} · up to {group.maxSelect}
                </span>
              </legend>
              <div className="grid gap-1.5">
                {group.options.map((option) => {
                  const checked = (selected[group.id] ?? []).includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggle(group, option.id)}
                      aria-pressed={checked}
                      className={cn(
                        'flex items-center justify-between border px-3 py-2 text-left text-[12px] transition-colors',
                        checked
                          ? 'border-ink bg-paper-deep/60 text-ink'
                          : 'border-line text-ink-soft hover:border-line-strong',
                      )}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={cn(
                            'grid h-3.5 w-3.5 place-items-center border',
                            checked ? 'border-ink bg-ink text-paper' : 'border-line-strong',
                          )}
                        >
                          {checked ? <Check className="h-2 w-2" /> : null}
                        </span>
                        {option.name}
                        {option.nameEn ? <span className="text-muted">· {option.nameEn}</span> : null}
                      </span>
                      {Number(option.priceDelta) !== 0 ? (
                        <span className="money text-[11px] text-muted">+{formatTHB(option.priceDelta)}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="mt-5">
            <label
              htmlFor="dish-note"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink"
            >
              For the kitchen
            </label>
            <textarea
              id="dish-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={300}
              rows={2}
              placeholder="No coriander, extra spicy…"
              className="w-full border border-line bg-paper/60 px-3 py-2 text-[12px] text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-2 border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[11px] text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center gap-3 border-t border-line bg-surface-raised px-5 py-3">
          <div className="flex items-center border border-line-strong">
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              className="grid h-10 w-9 place-items-center text-muted transition-colors hover:text-ink"
              aria-label="Decrease quantity"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-8 text-center text-[13px] font-semibold tabular text-ink">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.min(20, value + 1))}
              className="grid h-10 w-9 place-items-center text-muted transition-colors hover:text-ink"
              aria-label="Increase quantity"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={add}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 bg-brand text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            Add to order · {formatTHB(unitPrice * quantity)}
          </button>
        </footer>
      </div>
    </div>
  );
}
