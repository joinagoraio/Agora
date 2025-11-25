export const enMessages = {
  common: {
    appName: "Agora",
    actions: {
      profile: "Profile",
      signOut: "Sign Out",
      cancel: "Cancel",
      delete: "Delete",
      save: "Save",
    },
    language: {
      label: "Language",
      english: "English",
      dutch: "Dutch",
      saving: "Updating language…",
      success: "Language updated",
      error: "We couldn't update your language preference. Please try again.",
    },
    navigation: {
      signIn: "Sign in",
      startTrial: "Start Free Trial",
      seeHowItWorks: "See How it Works",
      docs: "Documentation",
      support: "Support",
      blog: "Blog",
      pricing: "Pricing",
      about: "About",
      contact: "Contact",
      privacy: "Privacy",
      product: "Product",
      resources: "Resources",
      company: "Company",
      features: "Features",
      howItWorks: "How it Works",
      getStarted: "Get Started Free",
    },
  },
  landing: {
    overview: {
      title: "Everything you need to manage policies",
      description: "Connect, search, and chat with your policy documents using advanced AI technology.",
    },
    hero: {
      badge: "AI-Powered Policy Management",
      headingLineOne: "Your team's intelligent",
      headingLineTwo: "policy assistant",
      description:
        "Connect your policy documents, ask questions, and get instant AI-powered answers. Built for teams that need fast access to institutional knowledge.",
      primaryCta: "Start Free Trial",
      secondaryCta: "See How it Works",
    },
    stats: {
      speed: "Faster policy search",
      accuracy: "Accurate citations",
      availability: "Always available",
    },
    features: {
      connectors: {
        title: "Document Connectors",
        description:
          "Seamlessly integrate with Google Drive, Notion, Confluence, SharePoint, and Dropbox. All your policies in one place.",
      },
      assistant: {
        title: "AI Assistant",
        description:
          "Ask questions in natural language and get instant answers with accurate citations from your policy documents.",
      },
      search: {
        title: "Smart Search",
        description:
          "Full-text search with semantic understanding. Find exactly what you need, even if you don't know the exact wording.",
      },
      collaboration: {
        title: "Team Collaboration",
        description:
          "Organize workspaces for different teams, invite members, and control access with role-based permissions.",
      },
      security: {
        title: "Enterprise Security",
        description: "Multi-tenant architecture with row-level security. Your data is isolated, encrypted, and protected.",
      },
      performance: {
        title: "Lightning Fast",
        description: "Built with modern technology for instant responses. Get answers in seconds, not minutes.",
      },
    },
    howItWorks: {
      title: "Get started in minutes",
      description: "Three simple steps to transform how your team accesses policy information",
      steps: {
        connect: {
          title: "Connect Your Sources",
          description: "Link your Google Drive, Notion, or other platforms. Agora automatically syncs your policy documents.",
        },
        organize: {
          title: "Organize Workspaces",
          description: "Create spaces for different teams or departments. Invite members and set permissions.",
        },
        ask: {
          title: "Ask Questions",
          description: "Chat with your AI assistant to get instant answers with accurate citations from your documents.",
        },
      },
    },
    cta: {
      title: "Ready to transform your policy management?",
      description: "Join teams already using Agora to make their institutional knowledge instantly accessible.",
      primaryCta: "Get Started Free",
      secondaryCta: "Sign In",
    },
    footer: {
      description: "Your intelligent multi-tenant policy assistant powered by AI",
      copyright: "All rights reserved.",
    },
  },
  dashboard: {
    spaces: {
      title: "Spaces",
      subtitle: "Define the initiative that your workspaces execute within",
      emptyTitle: "No spaces yet",
      emptyDescription: "Create your first space to define and organize the scope of your initiative.",
    },
    workspaces: {
      title: "My Workspaces",
      subtitle: "Workspaces you've been invited to directly",
    },
  },
  profile: {
    backToDashboard: "Back to Dashboard",
    title: "Profile",
    subtitle: "View and manage your account information",
    account: {
      title: "Account Information",
      description: "Your personal account details",
      nameLabel: "Name",
      emailLabel: "Email",
      memberSinceLabel: "Member since",
    },
    accountId: {
      title: "Account ID",
      description: "Your unique account identifier",
    },
  },
  workspace: {
    navigation: {
      backToSpace: "Back to",
      backToDashboard: "Back to Dashboard",
    },
    metrics: {
      documents: {
        title: "Documents",
        uploaded: "Uploaded",
        created: "Created",
        inherited: "Inherited",
      },
      sources: {
        title: "Sources",
        subtitle: "Active connections",
      },
      conversations: {
        title: "Conversations",
        subtitle: "Your chats",
      },
    },
    sections: {
      myDocuments: {
        title: "My Documents",
        create: "New Document",
      },
      knowledge: {
        title: "Workspace Knowledge",
      },
      sources: {
        title: "Sources",
        description: "View and manage all files and connections synced into this workspace.",
      },
      inherited: {
        title: "Inherited Items",
        description: "Read-only answers, policies, and documents inherited from linked parent spaces.",
      },
      evidence: {
        title: "Workspace Evidence",
        description: "Curated findings, insights, and references assembled within this workspace.",
      },
    },
    tabs: {
      sources: "Sources",
      inherited: "Inherited",
      evidence: "Evidence",
      notes: "Notes",
    },
    chat: {
      header: "AI Assistant",
      toggle: {
        open: "Open chat",
        close: "Close chat",
      },
      actions: {
        newChat: "New Chat",
        collapseList: "Collapse list",
        expandList: "Expand list",
        rename: "Rename",
        archive: "Archive",
      },
      empty: {
        title: "No conversation selected",
        description: "Start a new conversation to begin chatting.",
      },
      list: {
        empty: "No conversations yet",
      },
      dialog: {
        deleteTitle: "Delete conversation?",
        deleteDescription: "This will permanently delete the conversation and all its messages.",
        deleteWarning: "This action cannot be undone.",
        confirmDelete: "Confirm delete",
      },
      rename: {
        title: "Rename conversation",
        description: "Give this conversation a clearer title.",
        placeholder: "Conversation title",
        validation: "Title cannot be empty",
        saving: "Saving",
      },
      toast: {
        genericError: "Something went wrong.",
        createError: "Could not start chat",
        createSuccess: "New chat started",
        createSuccessDescription: "Say hello to Agora AI.",
        deleteError: "Failed to delete chat",
        deleteSuccess: "Chat deleted",
        renameError: "Failed to rename chat",
        renameSuccess: "Chat renamed",
        archiveError: "Failed to archive chat",
        archiveSuccess: "Chat archived",
      },
    },
  },
} as const

export type EnMessages = typeof enMessages

