/**
 * MAR-387 — golden-journey fixtures.
 *
 * A small set of golden goals the mechanical client walks. Each fixture pins a
 * goal, the canned clarifying answers the client folds in when asked (keyed by
 * `ClarifyingQuestion["id"]`), and a note on what journey shape it exercises.
 * Kept separate from the suite so a later OpenRouter real-LLM variant can drive
 * the identical fixtures and diff an LLM's choices against the mechanical golden.
 *
 * Coverage across the set is deliberate: every scope-aware ⭐ terminal shape is
 * exercised (MAR-386, updated by MAR-395) —
 *   • golden_email_calendar → answer_clarifying_questions → dry run → prepare_runtime (medium, durable)
 *   • competitor_price_monitor → dry run → prepare_runtime (medium, durable, no questions)
 *   • one_shot_inbox_summary → build_in_assistant → assistant_surface terminal (small)
 *   • readonly_attended_inbox_summary → build_in_assistant → assistant_surface (small, explicit no-write/no-durable regression)
 *   • gmail_lead_to_crm → dry run → build_brief (medium, attended runtime)
 *   • invoice_intake_po_match → build_in_assistant (MAR-513: high-risk but attended/
 *     on-demand, mandatory-gate, README starter goal, added 2026-08-07)
 *   • pr_review_readonly → dry run → prepare_runtime (MAR-513 gap-list item 2: the
 *     other uncovered README starter goal — webhook-triggered, must-run-while-offline,
 *     hard no-write guarantee, added 2026-08-07)
 *   • chat_triggered_assistant → build_in_assistant (MAR-513 gap-list item 2a: route
 *     coverage for a candidate playbook that had no route file at all, added 2026-08-07)
 *   • second_brain_owned_corpus → build_in_assistant (MAR-525 sub-item 2b: the goal
 *     shape that used to be shadowed by research_agent_citations, dropping the
 *     owned-corpus-only guardrail, added 2026-08-07)
 *   • crm_lead_enrichment → dry run → prepare_runtime (MAR-526 slice 1: CRM read →
 *     enrich → gated deal advance, the first route to carry crm_record_read /
 *     lead_enrichment / deal_stage_update, added 2026-08-07)
 *   • multi_agent_coder_loop → generate_linear_project → linear_issues (large — plan it)
 *
 * MAR-395: the two SMALL fixtures used to terminate on `attended_dry_run`. A
 * small, attended goal is now recommended INTO a no-code assistant surface it
 * can actually live in; the in-chat dry run stays in the menu as a preview.
 *
 * MAR-392 also locks six semantic goal shapes across the matrix: read-only,
 * fully unattended, explicitly allowed outbound sends, multiple clarifying
 * questions, validated playbooks, and a deliberately vague starting goal.
 */
import type { JourneyFixture } from "../../../src/journey/mechanicalClient.js";

export const JOURNEY_FIXTURES: JourneyFixture[] = [
  {
    name: "golden_email_calendar",
    // The P0-02 golden prompt (RESPONSE-UX / MAR-385). Durable + build intent, and
    // the one goal that raises exactly one material question (calendar_notification).
    goal:
      "Build an email and calendar assistant that reads unread Gmail meeting requests, " +
      "checks my real Google Calendar, drafts a reply with two available 30-minute slots, " +
      "and only after I approve creates one Calendar event and one Gmail draft. Never send " +
      "the email. I will be present for approval and I want visible run logs.",
    canned_answers: {
      // Recommended option is private_hold; the phrase "private hold" is a stated
      // signal that clears the question so the next plan converges.
      calendar_notification:
        "Keep the calendar entry as a private hold on my calendar and do not notify the other person.",
    },
    coverage_tags: [],
    expectations: {
      initial: {
        recommended_next_click_id: "answer_clarifying_questions",
        clarifying_questions: [
          {
            id: "calendar_notification",
            question_includes: ["private hold", "real invitation", "Google may email"],
            options: [
              "A private hold on my calendar — the other person is NOT notified (sendUpdates=none)",
              "A real invitation the other person receives — Google may email them on my behalf",
            ],
          },
        ],
      },
      resolved: {
        recommended_next_click_id: "dry_run_in_chat",
        clarifying_questions: [],
        route_includes: ["email_read", "calendar_write", "human_approval_gate"],
        route_excludes: ["email_send", "optional_email_send"],
        enforced_approval_gates: ["human_approval_gate"],
      },
    },
    notes:
      "Exercises the clarifying-answer fold loop, then reaches the prepare_runtime " +
      "terminal (offline-required) with the walking-skeleton disclosure present.",
  },
  {
    name: "competitor_price_monitor",
    goal:
      "Build an agent that checks 5 competitor pages every morning, detects price changes, " +
      "and sends me a Slack summary. I want to approve before anything external is changed.",
    canned_answers: {},
    coverage_tags: ["validated_playbook"],
    expectations: {
      initial: {
        plan_source: "playbook",
        playbook_id: "competitor_price_monitor",
        route_includes: ["scheduled_trigger", "page_monitor", "slack_notification", "audit_log"],
        enforced_approval_gates: [],
        automation_clearance_level: "L2",
        clarifying_questions: [],
      },
    },
    notes:
      "No clarifying questions; scheduled + offline-required, so the mechanical client " +
      "goes straight to the prepare_runtime terminal.",
  },
  {
    name: "dash_local_long_running",
    goal:
      "Build a local agent that continuously watches my Gmail for new sales leads, drafts " +
      "replies, and waits for my approval. Never send email. The separately installed DASH " +
      "Agent Runner is available. Keep running after the DASH window closes while this computer remains on.",
    canned_answers: {
      run_trigger: "Start on each new Gmail event.",
      build_surface: "Build it in Codex as code.",
      hosting_monitoring:
        "Run it locally with the separately installed DASH Agent Runner and monitor/control it in DASH.",
    },
    coverage_tags: [],
    expectations: {
      resolved: {
        runtime_recommendation_id: "dash_agent_runner_local",
        runtime_class: "local_process",
        control_surface_id: "dash_control",
        interaction_surface_id: "approval_inbox_interaction",
        monitoring_recommendation_id: "dash_import",
        build_surface_recommendation_id: "dash_agent_runner",
        question_flow_options: [
          {
            round_id: "build_surface",
            option_id: "dash_agent_runner",
            label_includes: ["DASH Agent Runner", "local runtime"],
            description_includes: [
              "separately installed runner",
              "Closing DASH does not stop it",
              "power-off",
            ],
          },
          {
            round_id: "monitoring",
            option_id: "dash",
            label_includes: ["DASH", "manifest v2"],
            description_includes: [
              "monitor/control surface",
              "still runs the agent",
            ],
          },
        ],
      },
    },
    notes:
      "MAR-427 presence fixture: a declared available local runner hosts the long-running " +
      "manifest-v2 code build, DASH controls/monitors it, and the interaction surface stays separate.",
  },
  {
    name: "dash_computer_off_absence",
    goal:
      "Build a local agent that continuously watches my Gmail for new sales leads, drafts " +
      "replies, and waits for my approval. Never send email. The separately installed DASH " +
      "Agent Runner is available, but it must keep working while my computer is asleep or off.",
    canned_answers: {
      run_trigger: "Start on each new Gmail event.",
      build_surface: "Build it in Codex as code.",
      hosting_monitoring: "Run it on a hosted endpoint and log each run to a file.",
    },
    coverage_tags: [],
    expectations: {
      resolved: {
        runtime_recommendation_id: "managed_durable_background_runtime",
        runtime_class: "managed_durable_background",
        runtime_alternative_excludes: ["dash_agent_runner_local"],
        interaction_surface_id: "approval_inbox_interaction",
        monitoring_recommendation_id: "log_to_file",
        build_surface_recommendation_id: "self_host_hosted",
        question_flow_absent_options: [
          {
            round_id: "build_surface",
            option_id: "dash_agent_runner",
          },
        ],
      },
    },
    notes:
      "MAR-427 paired absence fixture: the same long-running shape requires computer-off " +
      "execution, so the local DASH Agent Runner is neither recommended nor offered as the runtime.",
  },
  {
    name: "news_scout_local_public_feed",
    // The MAR-455/456 live-session goal, verbatim. MAR-455 fixed the route
    // (public_feed_fetch, zero credentials); MAR-456 fixes the recommendation
    // that follows it: `must_run_while_computer_off` is false and the output
    // is a file on this computer, so the build_surface ⭐ must land on the
    // local runtime, never the paid always-on host.
    goal: "Watch public news feeds for stories about AI agents and write me a daily digest file on my computer.",
    canned_answers: {},
    coverage_tags: [],
    expectations: {
      initial: {
        route_includes: ["public_feed_fetch", "scheduled_trigger"],
        route_excludes: ["page_monitor"],
      },
      resolved: {
        runtime_recommendation_id: "local_scheduled_runtime",
        runtime_class: "local_cron",
        build_surface_recommendation_id: "self_host_local",
        question_flow_absent_options: [],
      },
    },
    notes:
      "MAR-456 regression lock: a computer-on scheduled goal whose output is a local file must " +
      "recommend the local runtime over paid self-hosting, and the legacy hosting field must agree. " +
      "MAR-513 gap-list item 3: this composed shape is now also named as a registry artifact — " +
      "registry/playbooks/news_scout_local_public_feed.playbook.yaml and its route " +
      "news_scout_local_public_feed_route_v1 (both status: candidate, matching " +
      "validate_playbook_candidate's own certification — 3 components is below the beta " +
      "component-count bar, and validated/published needs Lab evidence this MCP session cannot " +
      "see). Candidate status keeps it out of the default-loaded registry, so plan_source stays " +
      "composed here; this fixture remains that named pattern's durable regression gate.",
  },
  {
    name: "one_shot_inbox_summary",
    goal: "summarize my inbox for me now",
    canned_answers: {},
    coverage_tags: [],
    expectations: {
      initial: {
        recommended_next_click_id: "build_in_assistant",
      },
    },
    notes:
      "Genuinely one-shot / small scope (nothing must outlive the session). MAR-395: the ⭐ " +
      "is a no-code assistant surface the goal can actually live in, not the in-chat dry run; " +
      "the dry run stays offered as a preview and carries NO walking-skeleton nag.",
  },
  {
    name: "readonly_attended_inbox_summary",
    goal:
      "Read my unread inbox now and give me a concise five-bullet summary in this chat. " +
      "This is read-only and attended: do not send, delete, archive, label, or modify any email; " +
      "do not create a scheduled or persistent agent.",
    canned_answers: {},
    coverage_tags: ["read_only"],
    expectations: {
      initial: {
        plan_source: "composed",
        route_includes: ["email_read"],
        route_excludes: [
          "email_draft",
          "email_send",
          "optional_email_send",
          "human_approval_gate",
          "scheduled_trigger",
          "state_store",
        ],
        enforced_approval_gates: [],
        automation_clearance_level: "L0",
        clarifying_questions: [],
        // MAR-395: small + attended + read-only → a no-code assistant surface.
        recommended_next_click_id: "build_in_assistant",
      },
    },
    seeded_attended_execution: {
      kind: "inbox_summary",
      expected_bullet_count: 5,
      messages: [
        {
          id: "seed-ops-417",
          from: "release@example.test",
          subject: "OPS-417 release review moved",
          body: "The release review moved to Tuesday at 14:00 UTC. No response is requested.",
          unread: true,
          required_anchor: "OPS-417",
        },
        {
          id: "seed-inv-204",
          from: "billing@example.test",
          subject: "Invoice INV-204 due Friday",
          body: "Invoice INV-204 is due Friday and is awaiting internal review.",
          unread: true,
          required_anchor: "INV-204",
        },
        {
          id: "seed-sec-881",
          from: "security@example.test",
          subject: "SEC-881 blocked login",
          body: "Security blocked a new login under alert SEC-881. No account change is required.",
          unread: true,
          required_anchor: "SEC-881",
        },
        {
          id: "seed-dr-52",
          from: "design@example.test",
          subject: "DR-52 feedback requested",
          body: "Feedback on design review DR-52 is requested by Wednesday.",
          unread: true,
          required_anchor: "DR-52",
        },
        {
          id: "seed-lunch-19",
          from: "events@example.test",
          subject: "LUNCH-19 order confirmed",
          body: "The LUNCH-19 team order is confirmed for lobby delivery at 12:30.",
          unread: true,
          required_anchor: "LUNCH-19",
        },
      ],
    },
    notes:
      "Explicit read-only/attended boundary: negated scheduled and persistent terms must not " +
      "create durable components or redundant build/hosting questions. Carries a five-message " +
      "synthetic inbox for an opt-in, integration-free execution check in the Lab.",
  },
  {
    name: "fully_unattended_price_monitor",
    goal:
      "Check 5 competitor product pages every hour; detect price changes; send an internal " +
      "Slack alert with a one-line summary when price drops below a configurable threshold; " +
      "fully unattended scheduled run with no human in the loop; read-only on all external " +
      "sites; deduplicate alerts.",
    canned_answers: {},
    coverage_tags: ["fully_unattended", "validated_playbook"],
    expectations: {
      initial: {
        plan_source: "playbook",
        playbook_id: "competitor_price_monitor",
        recommended_next_click_id: "dry_run_in_chat",
        route_includes: [
          "scheduled_trigger",
          "page_monitor",
          "deduplication",
          "state_store",
          "slack_notification",
          "audit_log",
        ],
        route_excludes: ["human_approval_gate"],
        enforced_approval_gates: [],
        automation_clearance_level: "L2",
        clarifying_questions: [],
      },
    },
    notes:
      "Fully unattended, no-human shape: the validated price-monitor route stays read-only " +
      "on monitored sites, carries deduplication/state, and must not claim a gate it does not contain.",
  },
  {
    name: "outbound_send_allowed",
    goal:
      "Read new support emails, classify urgency, and send an acknowledgement email automatically. " +
      "Outbound email sends are explicitly allowed, but never delete or modify incoming mail. " +
      "Run when I manually start it and show me the result.",
    canned_answers: {},
    coverage_tags: ["outbound_send_allowed"],
    expectations: {
      initial: {
        plan_source: "composed",
        recommended_next_click_id: "dry_run_in_chat",
        route_includes: [
          "email_read",
          "intent_classifier",
          "email_draft",
          "human_approval_gate",
          "optional_email_send",
        ],
        enforced_approval_gates: ["human_approval_gate"],
        automation_clearance_level: "L3",
        clarifying_questions: [],
      },
    },
    notes:
      "Explicitly permits outbound email, proving the planner retains the send path while " +
      "keeping the external write behind an enforced approval gate.",
  },
  {
    name: "vague_email_assistant",
    goal: "Build an email assistant.",
    canned_answers: {
      write_permission: "It may write or update only after my approval.",
      build_surface: "Build it inside ChatGPT.",
      hosting_monitoring: "Run it inside ChatGPT and I will check it manually.",
    },
    coverage_tags: ["multiple_clarifying_questions", "deliberately_vague"],
    expectations: {
      initial: {
        plan_source: "composed",
        recommended_next_click_id: "answer_clarifying_questions",
        clarifying_questions: [
          {
            id: "write_permission",
            question_includes: ["make changes", "read-and-report only"],
            options: [
              "Read & report only",
              "Write/update — with my approval",
              "Write/update automatically",
              "Not sure yet",
            ],
          },
          {
            id: "build_surface",
            question_includes: ["Where do you want to build", "scope is locked"],
            options: [
              "Codex",
              "Cursor / Claude Code",
              "Portable agent handoff prompt",
              "Not sure yet",
            ],
          },
          {
            id: "hosting_monitoring",
            question_includes: ["Where should it run", "monitor runs and approvals"],
            options: [
              "Local/cron + logs",
              "Hosted endpoint/job + logs",
              "Inside the client + manual checks",
              "Not sure yet",
            ],
          },
        ],
      },
      resolved: {
        plan_source: "composed",
        recommended_next_click_id: "dry_run_in_chat",
        route_includes: ["email_read", "email_draft", "human_approval_gate", "optional_email_send"],
        enforced_approval_gates: ["human_approval_gate"],
        automation_clearance_level: "L3",
        clarifying_questions: [],
      },
    },
    notes:
      "Deliberately vague goal: pins three material questions and their alternatives, then " +
      "proves the recommended answers converge to a terminal plan without freelancing.",
  },
  {
    name: "validated_content_pipeline",
    goal:
      "Start from a content brief, generate copy and visuals, send them to a reviewer for " +
      "approval, then publish externally only after approval.",
    canned_answers: {},
    coverage_tags: ["validated_playbook"],
    expectations: {
      initial: {
        plan_source: "playbook",
        playbook_id: "content_approval_pipeline",
        recommended_next_click_id: "dry_run_in_chat",
        route_includes: [
          "content_idea_intake",
          "copy_generation",
          "design_brief_generation",
          "human_approval_gate",
          "external_publish",
          "audit_log",
        ],
        enforced_approval_gates: ["human_approval_gate"],
        automation_clearance_level: "L4",
        clarifying_questions: [],
      },
    },
    notes:
      "Explicit validated-playbook shape: content generation and external publishing remain " +
      "ordered behind the non-droppable approval gate.",
  },
  {
    name: "gmail_lead_to_crm",
    goal:
      "Build an agent that reads new leads from Gmail, drafts a reply, updates the CRM, " +
      "and alerts sales in Slack after approval.",
    canned_answers: {},
    coverage_tags: ["validated_playbook"],
    expectations: {
      initial: {
        plan_source: "playbook",
        playbook_id: "email_lead_to_crm",
        route_includes: ["email_read", "crm_note_write", "human_approval_gate"],
        enforced_approval_gates: ["human_approval_gate"],
      },
    },
    notes:
      "Medium scope but attended runtime (manual trigger), so the dry run leads to the " +
      "build_brief deliverable rather than a runtime setup contract.",
  },
  {
    name: "invoice_intake_po_match",
    // One of two README "Try This First" starter goals a code-grounded MAR-513
    // audit found never exercised by this harness (2026-08-06), despite the
    // playbook's own notes calling it "the most-repeated shape in lab.db"
    // (promoted via MAR-302, 4+ real OrchestrateLab sessions).
    goal:
      "Read invoices from a shared inbox, extract the line items and totals, match " +
      "each one against the matching purchase order, flag discrepancies, and require " +
      "my approval before anything is routed to accounting. Never post to the ledger " +
      "automatically.",
    canned_answers: {},
    coverage_tags: ["validated_playbook"],
    expectations: {
      initial: {
        plan_source: "playbook",
        playbook_id: "invoice_intake_po_match",
        route_includes: [
          "email_read",
          "pdf_extraction",
          "schema_validation",
          "threshold_router",
          "human_approval_gate",
          "audit_log",
        ],
        route_excludes: ["email_draft", "email_send", "optional_email_send", "data_scraper"],
        enforced_approval_gates: ["human_approval_gate"],
        automation_clearance_level: "L2",
        clarifying_questions: [],
        // No scheduled_trigger and a MANDATORY per-invoice gate reads as
        // attended + on-demand to the scope assessor, so the ⭐ recommends
        // the no-code assistant surface, not a runtime setup contract.
        recommended_next_click_id: "build_in_assistant",
      },
    },
    notes:
      "High-risk (L2), mandatory-every-invoice gate, but attended/on-demand rather than " +
      "scheduled, so the ⭐ is the no-code assistant surface (build_in_assistant), not " +
      "dry_run_in_chat → build_brief like gmail_lead_to_crm's medium/attended shape.",
  },
  {
    name: "pr_review_readonly",
    // The second of the two README "Try This First" starter goals the MAR-513
    // gap-list audit (2026-08-06) found never exercised by this harness. Same
    // exact goal wording already locked by planWorkflow.test.ts's PR_REVIEW_LOCK_GOAL
    // and hostingAndMonitoringEvals.test.ts's PR_REVIEW_WEBHOOK, reused here
    // id-for-id rather than paraphrased.
    goal:
      "When a pull request is opened on GitHub, review the diff for problems and post a summary " +
      "comment. Never edit or commit any code — read-only.",
    canned_answers: {},
    coverage_tags: ["validated_playbook", "read_only"],
    expectations: {
      initial: {
        plan_source: "playbook",
        playbook_id: "pr_review_readonly",
        recommended_next_click_id: "dry_run_in_chat",
        route_includes: [
          "github_trigger",
          "schema_validation",
          "codebase_scan",
          "pr_summary",
          "reviewer_notification",
          "audit_log",
        ],
        // The hard no-write guarantee (MAR-267): code_editing must never enter this
        // route, and test_runner requires code_editing per its registry contract.
        route_excludes: ["code_editing", "test_runner"],
        enforced_approval_gates: [],
        automation_clearance_level: "L2",
        clarifying_questions: [],
      },
    },
    notes:
      "Webhook-triggered (github_trigger), event-driven but must keep running while the " +
      "user is offline, so scope assessment lands on medium/durable — same family as " +
      "competitor_price_monitor's fully_unattended fixture — and the ⭐ dry run resolves " +
      "to the prepare_runtime terminal, not build_brief. Read-only is the whole point: " +
      "route_excludes locks the no-write guarantee the MAR-140/MAR-267 lineage exists to hold.",
  },
  {
    name: "chat_triggered_assistant",
    // MAR-513 gap-list item 2a: chat_triggered_assistant is stuck at
    // status: candidate with zero fixture coverage, and its own
    // golden_path_route_id was an explicit empty string (no route file at
    // all) until this session added chat_triggered_assistant_route_v1.
    // Candidate status keeps both out of the default-loaded registry
    // (loadRegistry({ includeBeta: false }), no includeCandidates option —
    // see registryAssembly.ts), so plan_source stays composed here even
    // after naming the route; that promotion needs OrchestrateLab session
    // evidence this MCP session cannot see. This fixture is the durable
    // regression gate for the composed shape the live matcher actually
    // produces for the playbook's own goal (live-probed 2026-08-07).
    goal:
      "Build a Discord bot that responds to a slash command from an allowed team member, " +
      "classifies it, performs the action, and posts the result in the same thread only after " +
      "I approve it.",
    canned_answers: {},
    // NOT read_only: this goal posts to Discord. It carried the `read_only`
    // tag because "the same THREAD ONLY after I approve" substring-matched
    // "read only" and fired the read-only prohibition — the false positive this
    // fixture's own goal wording exposed. `readonly_attended_inbox_summary` and
    // `pr_review_readonly` carry the tag for real.
    coverage_tags: [],
    expectations: {
      initial: {
        plan_source: "composed",
        playbook_id: null,
        route_includes: [
          "chat_trigger",
          "schema_validation",
          "human_approval_gate",
          "auth_failure_handler",
          "discord_notification",
          "audit_log",
        ],
        // Two components on chat_triggered_assistant's own aspirational list —
        // intent_classifier and state_store — do not cleanly fire from natural
        // phrasing of this goal (see chat_triggered_assistant_route_v1's notes);
        // reviewer_notification and loop_controller are matcher noise observed
        // while probing nearby phrasings and must never leak into this route.
        route_excludes: ["intent_classifier", "state_store", "reviewer_notification", "loop_controller"],
        enforced_approval_gates: ["human_approval_gate"],
        automation_clearance_level: "L2",
        clarifying_questions: [],
        recommended_next_click_id: "build_in_assistant",
      },
    },
    notes:
      "Route coverage for chat_triggered_assistant (MAR-513 gap-list item 2a): small/attended " +
      "scope, so the ⭐ is the no-code assistant surface, same family as invoice_intake_po_match's " +
      "build_in_assistant terminal. Candidate playbook status means this stays plan_source " +
      "composed rather than playbook — see chat_triggered_assistant_route_v1's notes for why " +
      "that is the honest, live-probed shape rather than a guess.",
  },
  {
    name: "second_brain_owned_corpus",
    // MAR-525 sub-item 2b. This goal is second_brain_assistant's OWN shape and
    // it used to come back as `plan_source: "playbook"` /
    // `research_agent_citations` — a public-web research pipeline
    // (user_goal_intake → source_retrieval → source_ranking →
    // research_synthesis → citation_checker → source_freshness_check →
    // state_store) with safety_review "pass" and risk 0, silently dropping the
    // owned-corpus-only guardrail the goal implies (live probe 2026-08-07).
    //
    // second_brain_assistant itself stays `status: candidate` and therefore
    // invisible (DEFAULT_ALLOWED = published/validated; promotion needs
    // OrchestrateLab evidence per validate_playbook_candidate DoD #4), so
    // plan_source stays "composed" — but the goal now composes the OWNED
    // corpus path and the card states the guardrail either way.
    goal:
      "Build an assistant that answers questions from my personal notes vault and cites " +
      "the source note for every claim.",
    canned_answers: {},
    coverage_tags: [],
    expectations: {
      initial: {
        plan_source: "composed",
        playbook_id: null,
        route_includes: [
          "knowledge_ingestion",
          "vector_store",
          "source_ranking",
          "research_synthesis",
          "audit_log",
        ],
        // The whole point: no public/external fetch may enter a route whose
        // goal named the user's own corpus.
        route_excludes: [
          "source_retrieval",
          "data_scraper",
          "page_monitor",
          "public_feed_fetch",
        ],
        enforced_approval_gates: [],
        automation_clearance_level: "L1",
        clarifying_questions: [],
        recommended_next_click_id: "build_in_assistant",
      },
    },
    notes:
      "Small/attended knowledge-query scope, so the ⭐ is the no-code assistant surface. " +
      "The durable regression gate for MAR-525 2b: the shadowing (research_agent_citations " +
      "winning a personal-notes goal) is locked out by plan_source/playbook_id, and the " +
      "owned-corpus guardrail by route_excludes. Behavioural assertions on the card wording " +
      "live in tests/graph/ownedCorpusScope.test.ts.",
  },
  {
    name: "crm_lead_enrichment",
    // MAR-526 slice 1 (MAR-513 gap-list item 3): crm_record_read,
    // lead_enrichment and deal_stage_update all carried live matcher
    // vocabulary while backing no route or playbook at all. crm_record_read
    // was worse than uncovered — it was UNREACHABLE: HINT_ONLY, and none of
    // its hints fired on the natural way a goal states a CRM read, so this
    // goal used to select crm_note_write (the CRM WRITE) for its read step.
    // This fixture pins the shape the matcher composes now that the read
    // vocabulary is complete, and is the durable gate for
    // crm_lead_enrichment_route_v1 (status: beta — still outside the
    // default-loaded registry, so plan_source stays composed).
    goal:
      "Build an agent that reads new leads from our CRM every morning, enriches each one " +
      "with company size and industry from an enrichment provider, and updates the deal " +
      "stage after I approve.",
    canned_answers: {},
    coverage_tags: [],
    expectations: {
      initial: {
        plan_source: "composed",
        playbook_id: null,
        route_includes: [
          "scheduled_trigger",
          "crm_record_read",
          "lead_enrichment",
          "human_approval_gate",
          "deal_stage_update",
          "audit_log",
        ],
        // The read step must be the CRM READ, never a page scrape or a
        // mailbox read — those are other playbooks' shapes.
        route_excludes: ["data_scraper", "email_read", "page_monitor"],
        enforced_approval_gates: ["human_approval_gate"],
        automation_clearance_level: "L3",
        clarifying_questions: [],
        recommended_next_click_id: "dry_run_in_chat",
      },
    },
    notes:
      "Medium scope with an irreversible external write, so the gate is enforced and " +
      "clearance is L3 — deal_stage_update declares `requires: human_approval_gate` in its " +
      "own component YAML, so the gate is a registry fact rather than a heuristic. " +
      "crm_note_write rides in as MAR-242's documented default CRM write and sits behind " +
      "the same gate; it is deliberately not in route_excludes because the live matcher " +
      "puts it there (probed 2026-08-07).",
  },
  {
    name: "stripe_data_report",
    // MAR-526 slice 2 (MAR-513 gap-list item 3): stripe_data_read carried
    // live capabilityMatcher vocabulary while backing no route or playbook
    // at all. Unlike crm_record_read (slice 1) it was already REACHABLE —
    // this goal correctly selects it, not data_scraper or nothing — so this
    // fixture is pure golden-path naming, the durable regression gate for
    // stripe_data_report_route_v1 (status: beta — still outside the
    // default-loaded registry, so plan_source stays composed).
    goal:
      "every morning, unattended, pull churn data from Stripe and post an at-risk-accounts " +
      "summary to Slack",
    canned_answers: {},
    coverage_tags: [],
    expectations: {
      initial: {
        plan_source: "composed",
        playbook_id: null,
        route_includes: [
          "scheduled_trigger",
          "stripe_data_read",
          "data_normalizer",
          "human_approval_gate",
          "slack_notification",
          "audit_log",
        ],
        // The read step must be the Stripe-specific integration, never the
        // generic scraper — that is a different, less-honest golden path.
        route_excludes: ["data_scraper"],
        enforced_approval_gates: [],
        automation_clearance_level: "L2",
        clarifying_questions: [],
        recommended_next_click_id: "dry_run_in_chat",
      },
    },
    notes:
      "human_approval_gate rides in because slack_notification is unconditionally in " +
      "ALWAYS_REQUIRES_GATE (src/graph/safetyAugmenter.ts); the goal's explicit " +
      "'unattended' phrasing downgrades it to an advisory (MAR-132) rather than removing " +
      "it, which is why enforced_approval_gates stays empty even though the component is " +
      "present on the route (probed 2026-08-07).",
  },
  {
    name: "airtable_data_report",
    // MAR-526 slice 2 (MAR-513 gap-list item 3): airtable_lookup, same
    // finding as stripe_data_read above — already reachable, just unnamed.
    // The durable regression gate for airtable_data_report_route_v1 (status:
    // beta — still outside the default-loaded registry, so plan_source
    // stays composed).
    goal:
      "every morning, unattended, read records from our Airtable base and post a summary " +
      "report to Slack",
    canned_answers: {},
    coverage_tags: [],
    expectations: {
      initial: {
        plan_source: "composed",
        playbook_id: null,
        route_includes: [
          "scheduled_trigger",
          "airtable_lookup",
          "report_generation",
          "human_approval_gate",
          "slack_notification",
          "audit_log",
        ],
        // The read step must be the Airtable-specific integration, never the
        // generic scraper — that is a different, less-honest golden path.
        route_excludes: ["data_scraper"],
        enforced_approval_gates: [],
        automation_clearance_level: "L2",
        clarifying_questions: [],
        recommended_next_click_id: "dry_run_in_chat",
      },
    },
    notes:
      "threshold_router and reviewer_notification also ride in on this goal — compose " +
      "noise from airtable_lookup's own summary text overlapping threshold_router's " +
      "'routing logic' vocabulary (matcher-flagged as word-overlap only, the same class " +
      "chat_triggered_assistant_route_v1 already documents) — deliberately NOT in " +
      "route_excludes because the live matcher puts them there (probed 2026-08-07). " +
      "human_approval_gate is advisory-only for the same MAR-132 reason as " +
      "stripe_data_report above.",
  },
  {
    name: "scheduled_data_export",
    // MAR-526 slice 3 (MAR-513 gap-list item 3): file_storage carried live
    // capabilityMatcher vocabulary ("spreadsheet", "google sheet", "csv",
    // "save/store/append it to") while backing no route or playbook at all.
    // Already reachable — pure golden-path naming, the durable regression
    // gate for scheduled_data_export_route_v1 (status: beta — still outside
    // the default-loaded registry, so plan_source stays composed). Paired
    // with db_read (scheduled_data_report's own source) rather than a
    // slice-2 source — this route is that playbook's "save it" sibling.
    goal:
      "every morning, unattended, read rows from our database and save them to a Google " +
      "Sheet",
    canned_answers: {},
    coverage_tags: [],
    expectations: {
      initial: {
        plan_source: "composed",
        playbook_id: null,
        route_includes: ["scheduled_trigger", "db_read", "file_storage", "audit_log"],
        // A "save it" goal must never be planned as a "notify" goal.
        route_excludes: ["slack_notification", "human_approval_gate"],
        enforced_approval_gates: [],
        automation_clearance_level: "L3",
        clarifying_questions: [],
        recommended_next_click_id: "dry_run_in_chat",
      },
    },
    notes:
      "No enforced gate: file_storage writes to storage the user already owns and is not " +
      "in safetyAugmenter.ts's ALWAYS_REQUIRES_GATE, unlike the Slack/CRM/calendar writes " +
      "that are. automation_clearance stays L3 (external writes default to non-autonomous) " +
      "purely on the write-component heuristic, not a gate requirement (probed 2026-08-07).",
  },
  {
    name: "observability_alerting",
    // MAR-526 slice 4 (MAR-513 gap-list item 3): uptime_check,
    // metric_threshold_monitor and log_monitor all carried live
    // capabilityMatcher vocabulary while backing no route or playbook at
    // all — competitor_price_monitor's own avoid_when already points users
    // here for non-page monitoring. All three were already independently
    // reachable; the durable regression gate for observability_alerting_route_v1
    // (status: beta — still outside the default-loaded registry, so
    // plan_source stays composed).
    goal:
      "every 5 minutes, unattended, monitor our service uptime, error rate metric, and " +
      "logs for anomalies, and alert Slack",
    canned_answers: {},
    coverage_tags: [],
    expectations: {
      initial: {
        plan_source: "composed",
        playbook_id: null,
        route_includes: [
          "scheduled_trigger",
          "uptime_check",
          "metric_threshold_monitor",
          "log_monitor",
          "human_approval_gate",
          "slack_notification",
          "audit_log",
        ],
        // Infra/app monitoring, never a web-page watch.
        route_excludes: ["page_monitor"],
        enforced_approval_gates: [],
        automation_clearance_level: "L2",
        clarifying_questions: [],
        recommended_next_click_id: "generate_linear_project",
      },
    },
    notes:
      "Combining three provider connections (uptime, metrics, logs) drives scope_assessment " +
      "to 'large' ('4 connections to wire up') — the ⭐ is generating the plan as Linear " +
      "issues, not a single dry run, an accurate reflection of real setup cost rather than " +
      "a routing bug. reviewer_notification also rides in on this goal (generic 'alert' " +
      "word-overlap noise) — deliberately NOT in route_excludes because the live matcher " +
      "puts it there (probed 2026-08-07), same class as chat_triggered_assistant_route_v1.",
  },
  {
    name: "variant_review",
    // MAR-526 slice 5 (MAR-513 gap-list item 3, final slice): fan_out_collector,
    // multi_variant_generator and review_draft_composer all carried live
    // capabilityMatcher vocabulary while backing no route or playbook at
    // all. All three were already independently reachable; the durable
    // regression gate for variant_review_route_v1 (status: beta — still
    // outside the default-loaded registry, so plan_source stays composed).
    goal:
      "generate 3 headline variants for a landing page in parallel, fan the results back " +
      "together, stage for review, and require my approval before anything ships",
    canned_answers: {},
    coverage_tags: [],
    expectations: {
      initial: {
        plan_source: "composed",
        playbook_id: null,
        route_includes: [
          "fan_out_collector",
          "multi_variant_generator",
          "review_draft_composer",
          "human_approval_gate",
          "audit_log",
        ],
        enforced_approval_gates: ["human_approval_gate"],
        automation_clearance_level: "L3",
        clarifying_questions: [],
        recommended_next_click_id: "generate_linear_project",
      },
    },
    notes:
      "The goal's explicit 'require my approval' is an approval REQUIREMENT (not a waiver), " +
      "so the gate is enforced, not advisory. Multi-agent fan-out drives scope_assessment to " +
      "'large', recommending the Linear-project path (probed 2026-08-07). The bare word " +
      "'draft' fuzzy-matches email_draft regardless of context, so this goal deliberately " +
      "uses 'stage for review' rather than 'compose a review draft' to avoid a spurious " +
      "email_draft/optional_email_send tail — filed as a follow-up task, not fixed here.",
  },
  {
    name: "teams_triggered_assistant",
    // MAR-526 slice 5: teams_notification carried live capabilityMatcher
    // vocabulary while backing no route or playbook at all — Teams/Telegram
    // parity with chat_triggered_assistant_route_v1's existing Discord
    // shape. The durable regression gate for
    // teams_triggered_assistant_route_v1 (status: beta — still outside the
    // default-loaded registry, so plan_source stays composed).
    goal:
      "Build a Microsoft Teams bot that responds to a slash command from an allowed team " +
      "member, classifies it, performs the action, and posts the result in the same " +
      "thread only after I approve it.",
    canned_answers: {},
    coverage_tags: [],
    expectations: {
      initial: {
        plan_source: "composed",
        playbook_id: null,
        route_includes: [
          "chat_trigger",
          "schema_validation",
          "human_approval_gate",
          "auth_failure_handler",
          "teams_notification",
          "audit_log",
        ],
        route_excludes: ["discord_notification", "slack_notification", "telegram_notification"],
        enforced_approval_gates: ["human_approval_gate"],
        automation_clearance_level: "L2",
        clarifying_questions: [],
        recommended_next_click_id: "build_in_assistant",
      },
    },
    notes:
      "Identical shape to chat_triggered_assistant_route_v1's Discord goal with only the " +
      "platform name swapped (probed 2026-08-07) — intent_classifier and state_store do not " +
      "cleanly fire from natural phrasing of this goal, same documented gap as the Discord " +
      "route.",
  },
  {
    name: "telegram_triggered_assistant",
    // MAR-526 slice 5: telegram_notification, same finding as
    // teams_triggered_assistant above. The durable regression gate for
    // telegram_triggered_assistant_route_v1 (status: beta).
    goal:
      "Build a Telegram bot that responds to a slash command from an allowed team " +
      "member, classifies it, performs the action, and posts the result in the same " +
      "thread only after I approve it.",
    canned_answers: {},
    coverage_tags: [],
    expectations: {
      initial: {
        plan_source: "composed",
        playbook_id: null,
        route_includes: [
          "chat_trigger",
          "schema_validation",
          "human_approval_gate",
          "auth_failure_handler",
          "telegram_notification",
          "audit_log",
        ],
        route_excludes: ["discord_notification", "slack_notification", "teams_notification"],
        enforced_approval_gates: ["human_approval_gate"],
        automation_clearance_level: "L2",
        clarifying_questions: [],
        recommended_next_click_id: "build_in_assistant",
      },
    },
    notes:
      "Identical shape to chat_triggered_assistant_route_v1's Discord goal with only the " +
      "platform name swapped (probed 2026-08-07). This is the last of MAR-526's 5 slices — " +
      "all 14 gap-list vocabulary components now have a named route or playbook.",
  },
  {
    name: "multi_agent_coder_loop",
    goal:
      "Run a coder agent and a reviewer agent in a loop until all tests pass, maximum 5 " +
      "iterations, then open a pull request for my approval.",
    canned_answers: {},
    coverage_tags: [],
    notes:
      "Large scope (multi-agent loop), so the ⭐ is generating the plan as Linear issues — " +
      "the plan-it path, not a single build prompt.",
  },
];
