import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateDomainsForRole } from '../services/geminiService';
import { Loader2, Sparkles, User, ArrowRight, Check } from 'lucide-react';
import { UserProfile, FocusTheme, TaskIntent } from '../types';
import { useUserStore } from '../store/useUserStore';

// ==========================================
// 1. Data Configuration (Domain Data)
// ==========================================
const DOMAINS = [
  { id: 'health', icon: '🌿', title: 'Body & Mind', desc: 'Sleep, De-stress, Exercise', options: ['Improve Sleep Quality', 'Regular Exercise Habit', 'Mental De-stressing'] },
  { id: 'career', icon: '🚀', title: 'Career Break', desc: 'Skills, New Role, Projects', options: ['Master Core Skills', 'Seek External Opportunities', 'Boost Influence'] },
  { id: 'study', icon: '📚', title: 'Academic Sprint', desc: 'Exams, Languages, GPA', options: ['Ace Major Exams', 'Conquer Weak Subjects', 'Expand Knowledge'] },
  { id: 'relation', icon: '❤️', title: 'Deep Connect', desc: 'Family, Social Quality', options: ['Quality Family Time', 'Prune Toxic Ties', 'Find Soul Resonance'] },
  { id: 'wealth', icon: '💰', title: 'Wealth Control', desc: 'Invest, Side Hustle, Budget', options: ['Control Expenses', 'Start Side Hustle', 'Learn Investing'] },
  { id: 'spirit', icon: '🎨', title: 'Inner Wild', desc: 'Hobbies, Travel, Creativity', options: ['Explore Unknown Places', 'Cultivate New Hobby', 'Creative Expression'] },
];

type Step = 'profile' | 'identity' | 'domain' | 'prompt' | 'skip_modal' | 'select_domains' | 'refine_domains' | 'preview';

const ROLES = [
  { id: 'Student', label: 'Deep learner', icon: '🎓', sub: ['Undergraduate', 'Graduate student', 'Postgraduate exam taker', 'Job seeker', 'Lifelong learner'] },
  { id: 'Professional', label: 'Versatile professional', icon: '💼', sub: ['Product Manager', 'R&D Engineer', 'Design/Creative', 'Finance/Legal', 'Data Analyst', 'Product Operations/Growth', 'Marketing/Market'] },
  { id: 'Freelancer', label: 'Independent creator', icon: '🎨', sub: ['Independent developer', 'self-media', 'consulting advisor', 'freelance translator'] },
  { id: 'Mixed', label: 'Fuzzy state', icon: '🌫️', sub: ['In exploration', 'Slash youth', 'Transition period'] }
];

const AVATAR_MAX_BYTES = 900_000;

interface EchoOnboardingProps {
  onComplete: (profile: UserProfile, options: { skippedQuarterlyThemes: boolean }) => Promise<void>;
}

export default function EchoOnboarding({ onComplete }: EchoOnboardingProps) {
  const [step, setStep] = useState<Step>('profile');

  const [name, setName] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(undefined);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [domain, setDomain] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [dynamicDomains, setDynamicDomains] = useState<string[]>([]);
  const [isGeneratingDomains, setIsGeneratingDomains] = useState(false);
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([]);
  const [refineIndex, setRefineIndex] = useState(0);
  const [refinedOptions, setRefinedOptions] = useState<Record<string, string[]>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [identityBusy, setIdentityBusy] = useState(false);

  useEffect(() => {
    if (step === 'refine_domains') {
      setRefineIndex(0);
    }
  }, [step]);

  const toggleRole = (id: string) => {
    setSelectedRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleProfileConfirm = () => {
    setSubmitError(null);
    setStep('identity');
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith('image/')) return;
    if (f.size > AVATAR_MAX_BYTES) {
      setSubmitError('Image is too large (max ~900KB).');
      return;
    }
    setSubmitError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setAvatarDataUrl(url);
    };
    reader.readAsDataURL(f);
  };

  const handleIdentityConfirm = async () => {
    if (selectedRoleIds.length === 0 || identityBusy) return;
    setIdentityBusy(true);
    setSubmitError(null);
    setStep('domain');
    setIsGeneratingDomains(true);

    try {
      const unionSubs = [
        ...new Set(
          selectedRoleIds.flatMap((rid) => ROLES.find((r) => r.id === rid)?.sub ?? [])
        ),
      ];
      setDynamicDomains(unionSubs);

      const firstRole = ROLES.find((r) => r.id === selectedRoleIds[0]);
      const generated = await generateDomainsForRole(firstRole?.label ?? '');
      if (generated && generated.length > 0) {
        setDynamicDomains([...new Set([...generated, ...unionSubs])]);
      }
    } finally {
      setIsGeneratingDomains(false);
      setIdentityBusy(false);
    }
  };

  const handleDomainConfirm = () => {
    const manual = domainInput.trim();
    const chosen = manual || domain.trim();
    if (!chosen) return;
    setDomain(chosen);
    setSubmitError(null);
    setStep('prompt');
  };

  const toggleDomain = (id: string) => {
    setSelectedDomainIds((prev) => {
      if (prev.includes(id)) return prev.filter((d) => d !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const toggleRefineOption = (domainId: string, opt: string) => {
    setRefinedOptions((prev) => {
      const cur = prev[domainId] ?? [];
      const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
      return { ...prev, [domainId]: next };
    });
  };

  const setFocusThemes = useUserStore((state) => state.setFocusThemes);

  const buildProfile = (themes: FocusTheme[]): UserProfile => ({
    name,
    ...(avatarDataUrl !== undefined ? { avatar: avatarDataUrl } : {}),
    quarterlyThemes: themes,
    identity: selectedRoleIds[0] ?? null,
    roleIds: selectedRoleIds,
    domain,
  });

  const handleComplete = async () => {
    const themes: FocusTheme[] = selectedDomainIds.map((id) => {
      const d = DOMAINS.find((x) => x.id === id)!;
      const tags = refinedOptions[id]?.length ? refinedOptions[id]! : [d.options[0]];
      return {
        id: d.id,
        intent: d.title as TaskIntent,
        tags,
        isPrimary: true,
      };
    });

    setFocusThemes(themes);
    const profile = buildProfile(themes);
    setSubmitError(null);
    setSaving(true);
    try {
      await onComplete(profile, { skippedQuarterlyThemes: false });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save onboarding');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setFocusThemes([]);
    const profile: UserProfile = {
      name: name.trim() || 'Traveler',
      ...(avatarDataUrl !== undefined ? { avatar: avatarDataUrl } : {}),
      quarterlyThemes: [],
      identity: selectedRoleIds[0] ?? null,
      roleIds: selectedRoleIds,
      domain,
    };
    setSubmitError(null);
    setSaving(true);
    try {
      await onComplete(profile, { skippedQuarterlyThemes: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save onboarding');
    } finally {
      setSaving(false);
    }
  };

  const currentRefineId = selectedDomainIds[refineIndex];
  const currentRefineDomain = currentRefineId ? DOMAINS.find((d) => d.id === currentRefineId) : undefined;
  const canRefineConfirm =
    currentRefineId && (refinedOptions[currentRefineId]?.length ?? 0) > 0;

  const handleRefineConfirm = () => {
    if (!canRefineConfirm || !currentRefineId) return;
    if (refineIndex >= selectedDomainIds.length - 1) {
      setStep('preview');
    } else {
      setRefineIndex((i) => i + 1);
    }
  };

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  const domainChipSelected = (label: string) => domain === label;

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 font-sans text-slate-50 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {submitError && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {submitError}
          </div>
        )}
        <AnimatePresence mode="wait">

          {step === 'profile' && (
            <motion.div
              key="profile"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center text-center"
            >
              <label className="relative mb-8 cursor-pointer group">
                <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarFile} />
                <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-xl border border-slate-700 overflow-hidden bg-slate-800 group-hover:border-indigo-500/50 transition-colors">
                  {avatarDataUrl ? (
                    <img src={avatarDataUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={40} className="text-slate-400" />
                  )}
                </div>
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 whitespace-nowrap">
                  Tap to upload avatar
                </span>
              </label>
              <h1 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                Welcome to Echo
              </h1>
              <p className="text-slate-400 mb-8">How should we call you?</p>
              <input
                type="text"
                placeholder="Your Nickname"
                className="w-full px-6 py-4 bg-slate-900 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-center text-xl font-medium placeholder:text-slate-600 transition-all"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <button
                disabled={!name.trim()}
                onClick={handleProfileConfirm}
                className="mt-12 w-full py-4 bg-slate-50 text-slate-950 rounded-2xl font-bold text-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-indigo-500/10"
              >
                Confirm
              </button>
            </motion.div>
          )}

          {step === 'identity' && (
            <motion.div
              key="identity"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center text-center w-full max-w-2xl mx-auto"
            >
              <h2 className="text-2xl font-light mb-8 text-slate-300">FocusFunnel 需要了解你对自己的身份定位。你是？（可多选）</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {ROLES.map((role) => {
                  const selected = selectedRoleIds.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(role.id)}
                      className={`p-6 rounded-3xl border transition-all group text-left flex items-center gap-4 relative
                        ${selected
                          ? 'border-indigo-500 bg-indigo-500/15 shadow-[0_0_20px_rgba(99,102,241,0.12)]'
                          : 'border-white/10 bg-slate-900/50 hover:bg-slate-800'}
                      `}
                    >
                      {selected && (
                        <div className="absolute top-3 right-3 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center">
                          <Check size={14} className="text-white" />
                        </div>
                      )}
                      <span className="text-4xl">{role.icon}</span>
                      <div>
                        <h3 className="text-lg font-medium text-slate-100">{role.label}</h3>
                        <p className="text-xs text-slate-500 mt-1">{role.sub.slice(0, 3).join(', ')}...</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                disabled={selectedRoleIds.length === 0 || identityBusy}
                onClick={() => void handleIdentityConfirm()}
                className="mt-10 w-full max-w-md py-4 bg-slate-50 text-slate-950 rounded-2xl font-bold text-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white transition-all"
              >
                {identityBusy ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={20} />
                    Preparing…
                  </span>
                ) : (
                  'Confirm'
                )}
              </button>
            </motion.div>
          )}

          {step === 'domain' && (
            <motion.div
              key="domain"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center text-center w-full max-w-xl mx-auto"
            >
              <h2 className="text-2xl font-light mb-6 text-slate-300">告诉 FocusFunnel 你所从事的领域</h2>
              <div className="flex flex-wrap gap-3 justify-center min-h-[120px] items-center">
                {isGeneratingDomains && dynamicDomains.length === 0 ? (
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Loader2 className="animate-spin" size={20} />
                    <span className="text-sm">正在生成领域标签...</span>
                  </div>
                ) : (
                  dynamicDomains.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setDomain(s);
                        setDomainInput('');
                      }}
                      className={`px-6 py-3 rounded-full border transition-all
                        ${domainChipSelected(s)
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200'
                          : 'border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300'}
                      `}
                    >
                      {s}
                    </button>
                  ))
                )}
              </div>
              <input
                placeholder="或者手动输入你的职位/领域..."
                className="w-full mt-6 bg-transparent border-b border-slate-700 p-3 text-center outline-none focus:border-indigo-500 text-slate-200"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
              />
              <button
                disabled={!domainInput.trim() && !domain.trim()}
                onClick={handleDomainConfirm}
                className="mt-10 w-full py-4 bg-slate-50 text-slate-950 rounded-2xl font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white transition-all"
              >
                Confirm
              </button>
            </motion.div>
          )}

          {step === 'prompt' && (
            <motion.div
              key="prompt"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center text-center"
            >
              <div className="mb-8 p-4 bg-indigo-500/10 rounded-full">
                <Sparkles size={48} className="text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Set Your Course</h2>
              <p className="text-slate-400 mb-10 leading-relaxed max-w-xs">
                We&apos;d like to help you define <span className="text-indigo-400 font-semibold">up to 3 Quarterly Focus Themes</span>. These will serve as your compass for daily decision making.
              </p>
              <div className="space-y-4 w-full">
                <button
                  onClick={() => setStep('select_domains')}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-500 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/20"
                >
                  Yes, set themes now
                </button>
                <button
                  onClick={() => setStep('skip_modal')}
                  className="w-full py-4 bg-transparent text-slate-500 rounded-2xl font-medium hover:text-slate-300 transition-colors"
                  type="button"
                >
                  No, maybe later
                </button>
              </div>
            </motion.div>
          )}

          {step === 'skip_modal' && (
            <motion.div
              key="skip_modal"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center text-center bg-slate-900/50 p-8 rounded-3xl border border-slate-800 backdrop-blur-xl"
            >
              <h2 className="text-2xl font-bold mb-4">Skip quarterly themes?</h2>
              <p className="text-slate-400 mb-8 leading-relaxed">
                You can set your focus theme for the quarter anytime in Echo Compass.
              </p>
              <button
                disabled={saving}
                onClick={() => void handleSkip()}
                className="w-full py-4 bg-slate-50 text-slate-950 rounded-2xl font-bold flex justify-center items-center gap-2 hover:bg-white hover:scale-[1.02] transition-all disabled:opacity-50"
                type="button"
              >
                {saving ? <Loader2 className="animate-spin" size={20} /> : (
                  <>
                    Confirm <ArrowRight size={18} />
                  </>
                )}
              </button>
              <button
                onClick={() => setStep('prompt')}
                className="mt-6 text-sm text-slate-500 hover:text-slate-300 underline underline-offset-4"
                type="button"
              >
                Go Back
              </button>
            </motion.div>
          )}

          {step === 'select_domains' && (
            <motion.div
              key="select_domains"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col h-full"
            >
              <div className="mb-6 text-center">
                <h2 className="text-xl font-bold">What to change in 90 days?</h2>
                <p className="text-sm text-slate-500 mt-2 font-medium">
                  Select 1–3 areas ({selectedDomainIds.length}/3)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {DOMAINS.map((d) => {
                  const isSelected = selectedDomainIds.includes(d.id);
                  const isMaxedOut = selectedDomainIds.length >= 3 && !isSelected;

                  return (
                    <motion.div
                      key={d.id}
                      whileTap={{ scale: isMaxedOut ? 1 : 0.95 }}
                      onClick={() => !isMaxedOut && toggleDomain(d.id)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col items-start relative overflow-hidden
                        ${isSelected
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                          : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}
                        ${isMaxedOut ? 'opacity-30 grayscale cursor-not-allowed' : ''}
                      `}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                      <span className="text-3xl mb-3 block">{d.icon}</span>
                      <h3 className={`font-bold text-sm ${isSelected ? 'text-indigo-300' : 'text-slate-200'}`}>
                        {d.title}
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-1 leading-tight">{d.desc}</p>
                    </motion.div>
                  );
                })}
              </div>

              <button
                disabled={selectedDomainIds.length < 1 || selectedDomainIds.length > 3}
                onClick={() => setStep('refine_domains')}
                className="mt-auto w-full py-4 bg-slate-50 text-slate-950 rounded-2xl font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-white"
              >
                Confirm
              </button>
            </motion.div>
          )}

          {step === 'refine_domains' && currentRefineDomain && (
            <motion.div
              key={`refine-${currentRefineId}`}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col h-full overflow-y-auto no-scrollbar"
            >
              <h2 className="text-xl font-bold mb-2 text-center">Refine Your Focus</h2>
              <p className="text-sm text-slate-500 mb-2 text-center">
                Domain {refineIndex + 1} of {selectedDomainIds.length}
              </p>
              <p className="text-sm text-slate-500 mb-8 text-center">Select one or more specific intents (multi-select).</p>

              <div className="bg-slate-900/80 p-5 rounded-3xl border border-slate-800 mb-28">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{currentRefineDomain.icon}</span>
                  <h3 className="font-bold text-indigo-300">{currentRefineDomain.title}</h3>
                </div>
                <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider font-semibold">I want to focus on:</p>
                <div className="space-y-2">
                  {currentRefineDomain.options.map((opt) => {
                    const picked = refinedOptions[currentRefineId]?.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleRefineOption(currentRefineId, opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all border relative overflow-hidden
                          ${picked
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-900/50'
                            : 'bg-slate-800/50 text-slate-300 border-transparent hover:bg-slate-800'}
                        `}
                      >
                        <span className="relative z-10">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="fixed bottom-6 left-0 right-0 px-6 max-w-md mx-auto">
                <button
                  disabled={!canRefineConfirm}
                  onClick={handleRefineConfirm}
                  className="w-full py-4 bg-slate-50 text-slate-950 rounded-2xl font-bold disabled:opacity-30 transition-all shadow-xl shadow-black/50 hover:bg-white"
                  type="button"
                >
                  {refineIndex >= selectedDomainIds.length - 1 ? 'Continue' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'preview' && (
            <motion.div
              key="preview"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center text-center justify-center h-full"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mb-8 border border-yellow-500/30"
              >
                <Sparkles className="text-yellow-400" size={40} />
              </motion.div>

              <h2 className="text-2xl font-bold mb-2">Compass Calibrated</h2>
              <p className="text-sm text-slate-400 mb-10">See how your themes work their magic:</p>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-2xl mb-12 relative overflow-hidden max-w-xs mx-auto"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500"></div>
                <p className="text-xs text-slate-500 text-left mb-2">When you enter:</p>
                <p className="text-xl font-bold text-left mb-4 text-white">&quot;Trip to Yunnan&quot;</p>

                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 1.2 }}
                  className="flex items-start gap-3 bg-yellow-500/10 text-yellow-200 px-4 py-3 rounded-xl text-xs font-medium border border-yellow-500/20"
                >
                  <Sparkles size={16} className="shrink-0 mt-0.5" />
                  <span className="text-left">
                    AI: Matches <span className="text-yellow-400 font-bold">Inner Wild</span>.<br />
                    Marked as <span className="font-bold text-white">ANCHOR</span> task.
                  </span>
                </motion.div>
              </motion.div>

              <button
                disabled={saving}
                onClick={() => void handleComplete()}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                type="button"
              >
                {saving ? <Loader2 className="animate-spin inline-block" size={22} /> : 'Start Your Journey'}
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
