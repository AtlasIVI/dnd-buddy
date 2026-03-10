# ⚔️ DnD Buddy

> Companion App pour Donjons & Dragons 5e — React · TypeScript · Vite · Supabase · Realtime

DnD Buddy est une application web **mobile-first** permettant à un groupe de joueurs de gérer leur campagne de D&D 5e en temps réel. Le MJ contrôle la campagne depuis son écran, les joueurs gèrent leur personnage sur le leur — synchronisation instantanée via Supabase Realtime.

---

## Table des matières

1. [Stack technique](#1-stack-technique)
2. [Architecture de l'application](#2-architecture-de-lapplication)
3. [Système de campagne et rôles](#3-système-de-campagne-et-rôles)
4. [Fiche de personnage](#4-fiche-de-personnage)
5. [Système de compétences](#5-système-de-compétences)
6. [Sorts et emplacements de sorts](#6-sorts-et-emplacements-de-sorts)
7. [Inventaire et objets magiques](#7-inventaire-et-objets-magiques)
8. [Système de combat](#8-système-de-combat)
9. [Buffs temporaires et actifs](#9-buffs-temporaires-et-actifs)
10. [Base de données — Schéma complet](#10-base-de-données--schéma-complet)
11. [Temps réel et synchronisation](#11-temps-réel-et-synchronisation)
12. [Sécurité et permissions (RLS)](#12-sécurité-et-permissions-rls)

---

## 1. Stack technique

| Technologie | Rôle |
|---|---|
| **React 18** | Framework UI — composants fonctionnels + hooks |
| **TypeScript** | Typage strict — types générés depuis le schéma Supabase |
| **Vite** | Build tool ultra-rapide, HMR instantané |
| **Supabase** | Backend as a Service — PostgreSQL + Auth + Realtime + RLS |
| **react-icons/gi** | Icônes thématiques fantasy (Game Icons) |
| **CSS Variables** | Thème dynamique clair/sombre via custom properties |

### Commandes de développement

```bash
npm install          # Installation des dépendances
npm run dev          # Serveur de développement (localhost:5173)
npm run build        # Build de production
npm run preview      # Prévisualisation du build
```

---

## 2. Architecture de l'application

### Structure des fichiers

```
src/
  ├── components/
  │   ├── character/
  │   │   ├── CharacterSheet.tsx    # Fiche perso complète
  │   │   ├── SpellsPanel.tsx       # Sorts + emplacements
  │   │   ├── SkillsPanel.tsx       # Compétences + charges
  │   │   └── InventoryPanel.tsx    # Inventaire + objets
  │   ├── combat/
  │   │   └── CombatTracker.tsx     # Gestion du combat
  │   └── campaign/
  │       └── CampaignConfig.tsx    # Config MJ
  ├── pages/
  │   └── CampaignPage.tsx          # Page principale
  ├── contexts/
  │   └── AuthContext.tsx           # Auth Supabase
  ├── lib/
  │   └── supabase.ts               # Client Supabase
  └── types/
      └── database.ts               # Types générés automatiquement
```

### Flux de données

- **Supabase Realtime** — tous les composants s'abonnent aux changements PostgreSQL via `postgres_changes`
- **Pattern optimistic UI** — mise à jour locale immédiate, synchronisation BD en arrière-plan
- **Débounce 600ms** sur les champs texte (nom, notes) pour limiter les requêtes
- **Pas de state manager global** — chaque composant gère son propre état local + realtime

---

## 3. Système de campagne et rôles

### Rôles

| Rôle | Permissions |
|---|---|
| **Maître du Jeu (MJ)** | Contrôle total : configuration campagne, gestion combat, accès à toutes les fiches |
| **Joueur** | Gère uniquement son propre personnage, voit sa fiche et le combat en cours |

### Toggle GM / Player

La `CampaignPage` détecte automatiquement le rôle de l'utilisateur connecté via `campaign_members.role`. Les MJ voient le panneau de configuration, les joueurs voient directement leur fiche de personnage.

### Modes de campagne

| Mode | Description |
|---|---|
| `exploration` | Mode normal — joueurs accèdent à toute leur fiche, inventaire, sorts |
| `combat` | Mode combat — layout spécial avec accès rapide aux actions de combat |

### Code d'invitation

Chaque campagne a un `invite_code` unique généré automatiquement via la fonction SQL `generate_unique_invite_code()`. Les joueurs rejoignent en entrant ce code.

### Fonctionnalités MJ

- Créer / renommer la campagne
- Passer en mode combat (démarre un nouveau combat)
- Voir les fiches de tous les joueurs en lecture seule
- Configurer `gm_see_hidden` : voir les objets/compétences cachés des joueurs
- Gérer la bibliothèque de monstres
- Ajouter des PNJ à la campagne

---

## 4. Fiche de personnage

### Identité

Chaque joueur crée un personnage attaché à sa campagne. Les champs sont éditables avec sauvegarde automatique (debounce 600ms).

| Champ | Description |
|---|---|
| `name` | Nom du personnage |
| `race` | Race (Humain, Elfe, Nain, etc.) |
| `class` | Classe (Guerrier, Magicien, etc.) |
| `level` | De 1 à 20 |
| `xp` | Points d'expérience |

### Points de vie (PV)

- Boutons rapides : **-10 / -5 / -1 / +1 / +5 / +10**
- Barre de vie colorée : 🟢 vert (> 60%) → 🟠 orange (30–60%) → 🔴 rouge (< 30%)
- `PV max` = base + bonus items équipés
- `PV temporaires` = somme des `active_buffs` (sorts de buff)
- Bouton **"Full"** pour restaurer les PV au maximum

### Caractéristiques (stats)

6 caractéristiques classiques D&D 5e avec calcul automatique du modificateur :

| Abrév. | Nom | Modificateur |
|---|---|---|
| FOR (STR) | Force | `floor((valeur - 10) / 2)` |
| DEX (DEX) | Dextérité | idem |
| CON (CON) | Constitution | idem |
| INT (INT) | Intelligence | idem |
| SAG (WIS) | Sagesse | idem |
| CHA (CHA) | Charisme | idem |

### Bonus agrégés sur les stats

> **Valeur effective = base + passive skills + items équipés + active_buffs**

Les blocs de stats se colorent automatiquement en **vert** (bonus positif) ou **rouge** (malus). Un tooltip affiche les sources du bonus (ex : `"Anneau de Force (+2), Bénédiction (+1)"`).

### Classe d'Armure (CA)

`CA affichée = CA de base + bonus items équipés + bonus active_buffs`

### Effets de status

Section dédiée pour noter les effets actifs (empoisonné, béni, maudit...). Chaque effet a un nom, une description, une source, et un indicateur positif/négatif.

### Notes

Zone de texte libre pour les notes personnelles du joueur. Sauvegarde automatique.

---

## 5. Système de compétences

### Types de compétences

| Type | Description |
|---|---|
| **Active** (`is_active: true`) | Utilisée manuellement — bouton "Utiliser" avec gestion des charges |
| **Passive** (`is_active: false`) | Bonus permanent appliqué automatiquement aux stats ou à la CA |

### Propriétés d'une compétence

| Propriété | Description |
|---|---|
| `name` | Nom de la compétence |
| `description` | Description de l'effet |
| `ability` | Caractéristique associée (STR/DEX/CON/INT/WIS/CHA) |
| `modifier` | Modificateur affiché (ex: `"+1d6"`, `"Avantage"`) |
| `proficiency` | Niveau de maîtrise : `none` / `proficient` / `expertise` |
| `category` | Catégorie : `combat` / `social` / `exploration` / `connaissance` / `classe` / `autre` |
| `action_cost` | Coût d'action : `action` / `bonus_action` / `reaction` / `free` |
| `uses_max` | Nombre max d'utilisations (`null` = illimité) |
| `uses_remaining` | Utilisations restantes — affichées en pips (cercles) |
| `rest_reset` | Recharge lors d'un repos : `short` (court) ou `long` |
| `stat_bonus_ability` | Stat boostée (compétences passives uniquement) |
| `stat_bonus_value` | Valeur du bonus sur la stat |
| `tags` | Étiquettes libres pour filtrage |
| `is_hidden` | Masqué aux autres joueurs (visible par MJ si `gm_see_hidden`) |

### Système de charges (pips)

Les compétences actives avec `uses_max` affichent des **pips** (cercles pleins/vides). Cliquer sur "Utiliser" consomme une charge. Le bouton de repos recharge selon `rest_reset`.

### Tooltips

Survol des badges de bonus → tooltip listant les sources : `"Attaque Sournoise (+2d6), Expertise Perception (+5)"`.

---

## 6. Sorts et emplacements de sorts

### Structure d'un sort

| Propriété | Description |
|---|---|
| `level` | Niveau — `0` = cantrip, `1-9` = sorts à emplacement |
| `casting_time` | Temps d'incantation (`1 action`, `bonus`, `réaction`...) |
| `range` | Portée |
| `duration` | Durée |
| `concentration` | Sort de concentration (icône spéciale) |
| `damage_dice` | Dés de dégâts (ex: `8d6`) — affiché en rouge |
| `is_prepared` | Sort préparé (disponible pour la journée) |
| `is_hidden` | Sort caché des autres joueurs |

### Emplacements de sorts

Chaque niveau (1–9) a un nombre de slots configurables, représentés par des **pips cliquables**.

- Cliquer sur un pip **plein** = consomme le slot
- Cliquer sur un pip **vide** = récupère le slot
- Bouton **"Repos long"** = restaure tous les slots
- En mode combat : selector inline pour choisir le niveau d'emplacement (upcast)

### Onglets en mode exploration

| Onglet | Contenu |
|---|---|
| Cantrips | Sorts de niveau 0 — utilisables à volonté |
| Préparés | Sorts niv. 1+ avec `is_prepared = true` |
| Connus | Tous les sorts connus mais non préparés |

### Sorts de buff ✨

Les sorts peuvent appliquer des effets temporaires en combat via des propriétés dédiées :

| Propriété | Description |
|---|---|
| `buff_ca` | Bonus de CA temporaire |
| `buff_hp_temp` | PV temporaires accordés |
| `buff_stat_ability` | Statistique boostée temporairement |
| `buff_stat_value` | Valeur du bonus de stat |
| `buff_duration_rounds` | Durée en rounds (`null` = désactivation manuelle) |
| `buff_target_count` | Nombre de cibles maximum |

> En mode combat, les sorts de buff affichent un bouton **"Buff"** (bleu) qui ouvre un modal de sélection des cibles parmi les participants du combat actif.

---

## 7. Inventaire et objets magiques

### Structure d'un objet

| Propriété | Description |
|---|---|
| `name` | Nom de l'objet |
| `description` | Description |
| `quantity` | Quantité (modifiable +/−) |
| `is_equipped` | Équipé — active les buffs passifs |
| `is_hidden` | Masqué aux autres joueurs |
| `sort_order` | Ordre d'affichage |

### Buffs passifs (quand équipé)

Un objet équipé peut ajouter automatiquement des bonus :

| Propriété | Exemple |
|---|---|
| `bonus_ca` | `+2` CA pour une armure enchantée |
| `bonus_hp_max` | `+10` PV max pour une Amulette de Santé |
| `bonus_stat_ability` | Caractéristique boostée |
| `bonus_stat_value` | `+4` FOR pour des Gants de Force |

> **Un même objet peut combiner buffs passifs ET capacité active.** Ex : une Bague du Chaos qui donne `+1 CA` en permanence ET peut lancer *Boule de Feu* 1/jour.

### Capacité active

Un objet peut avoir une capacité activable avec son propre système de charges :

| Propriété | Description |
|---|---|
| `active_name` | Nom de la capacité (ex: `"Boule de feu"`) |
| `active_description` | Description de l'effet |
| `active_casting_time` | Coût d'action |
| `active_damage_dice` | Dés de dégâts si applicable |
| `active_uses_max` | Nombre max de charges (`null` = illimité) |
| `active_uses_remaining` | Charges restantes — affichées en pips dorés |
| `active_rest_reset` | Recharge : `short` (repos court) ou `long` (repos long) |

### Comportement en combat

- Équiper/Déséquiper est **désactivé** en combat (verrou visuel 🔒)
- Les capacités actives restent utilisables en combat
- La section **"Pouvoirs d'équipement"** apparaît dans la colonne droite du layout combat

### Interface ItemCard

- Clic sur l'item = expand/collapse pour voir les détails
- Badge coloré sur la ligne principale si l'item est équipé avec buffs
- Bouton équiper/déséquiper avec icône GiShield — désactivé en combat
- Section capacité active avec pips de charges dorés et bouton **"Utiliser"**

---

## 8. Système de combat

### Démarrage du combat

Le MJ démarre un combat depuis la `CampaignPage`. La fonction SQL `start_combat()` :

1. Crée un enregistrement dans `combats` avec `status = active`
2. Met à jour `campaigns.mode` → `"combat"`
3. Auto-ajoute tous les personnages de la campagne comme participants

### CombatTracker (vue MJ)

| Fonctionnalité | Description |
|---|---|
| Initiative | Saisie de l'initiative pour chaque participant |
| Ordre de jeu | Tri automatique par initiative décroissante |
| HP en combat | PV modifiables directement dans le tracker |
| Tour suivant | Avance l'index, décrémente les buffs expirés |
| Monstres | Ajout depuis la bibliothèque de monstres |
| PNJ | Ajout des PNJ de la campagne |
| Fin de combat | Appelle `end_combat()`, repasse en exploration |

### Layout combat (vue joueur)

```
┌─────────────────┬───────────────────────────────────────────┐
│  Fiche perso    │  Actions de combat                        │
│  (2fr — 40%)   │  (3fr — 60%)                              │
│                 │  ┌───────────┬───────────┬─────────────┐  │
│  • PV + barre   │  │ Compéten. │  Sorts    │  Pouvoirs   │  │
│  • Stats        │  │ actives   │  préparés │  équipement │  │
│  • Buffs actifs │  │           │           │             │  │
│  • Effets       │  └───────────┴───────────┴─────────────┘  │
└─────────────────┴───────────────────────────────────────────┘
```

### Détection automatique du mode combat

Un joueur passe automatiquement en vue combat si :
- La campagne est en mode `combat`
- SON personnage est dans `combat_participants`
- Son `hp_current > 0` (KO = retour automatique en vue exploration)

### Types de participants

| Type | Lié à |
|---|---|
| `player` | Table `characters` |
| `monster` | Table `monster_library` |
| `npc` | Table `npcs` |

---

## 9. Buffs temporaires et actifs

### Table `active_buffs`

| Colonne | Description |
|---|---|
| `character_id` | Personnage qui reçoit le buff (cible) |
| `applied_by_character_id` | Personnage qui a lancé le sort/utilisé l'objet |
| `combat_id` | Combat dans lequel le buff est actif |
| `source_type` | `"spell"` ou `"item"` |
| `source_name` | Nom du sort ou de l'objet source |
| `bonus_ca` | Bonus de CA temporaire |
| `bonus_hp_temp` | PV temporaires |
| `bonus_stat_ability` | Stat boostée temporairement |
| `bonus_stat_value` | Valeur du bonus |
| `applied_at_round` | Round où le buff a été appliqué |
| `expires_at_round` | Round d'expiration (`null` = désactivation manuelle) |
| `is_active` | Actif ou non |

### Durée des buffs

| Mode | Comportement |
|---|---|
| **Durée en rounds** | `expires_at_round = applied_at_round + buff_duration_rounds`. Le CombatTracker décrémente automatiquement à chaque tour. |
| **Durée manuelle** | `expires_at_round = null`. Le joueur désactive manuellement depuis sa fiche. |

### Agrégation des bonus

```
Valeur finale d'une stat =
  Valeur de base
  + Bonus des compétences passives  (skills.is_active = false)
  + Bonus des items équipés         (inventory_items.is_equipped = true)
  + Bonus des active_buffs actifs   (active_buffs.is_active = true)

Même logique pour CA et HP max.
```

### Affichage des buffs actifs

- Badge bleu : `"✨ Bénédiction • jusqu'au round 5"`
- Bouton ✕ pour désactiver manuellement (durée manuelle)
- Stats colorées en **vert** si bonus positif, **rouge** si malus

---

## 10. Base de données — Schéma complet

### Tables

| Table | Colonnes clés | Description |
|---|---|---|
| `profiles` | `id, display_name` | Profils utilisateurs (extension auth.users) |
| `campaigns` | `id, name, mode, status, invite_code` | Campagnes — mode: exploration\|combat |
| `campaign_members` | `campaign_id, user_id, role` | Membres — role: gm\|player |
| `characters` | `id, name, hp_current, hp_max, str/dex/con/int/wis/cha, level` | Fiches de personnage |
| `effects` | `character_id, name, is_positive` | Effets de status actifs |
| `skills` | `character_id, is_active, uses_max, stat_bonus_ability` | Compétences actives et passives |
| `spells` | `character_id, level, buff_ca, buff_hp_temp, buff_duration_rounds` | Sorts + propriétés de buff |
| `spell_slots` | `character_id, slot_level, slots_total, slots_used` | Emplacements de sorts |
| `inventory_items` | `character_id, is_equipped, bonus_ca, active_name, active_uses_max` | Inventaire + objets magiques |
| `active_buffs` | `character_id, source_type, bonus_ca, expires_at_round, is_active` | Buffs temporaires en combat |
| `combats` | `campaign_id, status, current_turn_index` | Combats en cours ou terminés |
| `combat_participants` | `combat_id, character_id, hp_current, initiative` | Participants au combat |
| `npcs` | `campaign_id, name, hp_current, is_visible_to_players` | PNJ de la campagne |
| `monster_library` | `created_by, name, hp_default, armor_class` | Bibliothèque de monstres réutilisables |

### Enums PostgreSQL

| Enum | Valeurs |
|---|---|
| `campaign_mode` | `exploration`, `combat` |
| `campaign_role` | `gm`, `player` |
| `combat_status` | `active`, `ended` |
| `participant_type` | `player`, `monster`, `npc` |
| `rest_type` | `short`, `long` |
| `skill_ability` | `STR`, `DEX`, `CON`, `INT`, `WIS`, `CHA` |
| `skill_action_cost` | `action`, `bonus_action`, `reaction`, `free` |
| `skill_category` | `combat`, `social`, `exploration`, `connaissance`, `classe`, `autre` |
| `skill_proficiency` | `none`, `proficient`, `expertise` |

### Fonctions SQL

| Fonction | Description |
|---|---|
| `start_combat(p_campaign_id)` | Démarre un combat, crée les participants, change le mode en `"combat"` |
| `end_combat(p_combat_id)` | Termine le combat, remet le mode en `"exploration"` |
| `add_monsters_to_combat(p_combat_id, p_monster_id, p_count)` | Ajoute N monstres à un combat |
| `generate_unique_invite_code()` | Génère un code unique pour rejoindre une campagne |
| `is_campaign_gm(p_campaign_id)` | Vérifie si l'utilisateur courant est MJ |
| `is_campaign_member(p_campaign_id)` | Vérifie si l'utilisateur est membre |
| `gm_can_see_hidden(p_campaign_id)` | Vérifie si le MJ peut voir les éléments cachés |

---

## 11. Temps réel et synchronisation

Chaque composant s'abonne aux changements PostgreSQL via **Supabase Realtime** (`postgres_changes`). Les mises à jour sont instantanées entre tous les appareils connectés.

### Canaux Realtime par composant

| Composant | Tables écoutées |
|---|---|
| `CharacterSheet` | `characters`, `effects`, `skills`, `inventory_items`, `active_buffs` |
| `SpellsPanel` | `spells`, `spell_slots` |
| `InventoryPanel` | `inventory_items` |
| `CombatTracker` | `combats`, `combat_participants` |
| `CampaignPage` | `campaigns`, `combat_participants` (détection mode combat) |

### Pattern optimistic UI

Les mises à jour visuelles sont **immédiates** (optimistic update), puis synchronisées avec la BD. En cas d'erreur, le composant se re-synchronise via `fetchItems()`.

---

## 12. Sécurité et permissions (RLS)

Toutes les tables ont **Row Level Security (RLS)** activé. Les politiques garantissent que chaque utilisateur ne peut accéder qu'aux données autorisées.

### Politiques RLS clés

| Table | Politique |
|---|---|
| `characters` | SELECT : membres de la campagne. INSERT/UPDATE/DELETE : propriétaire seulement |
| `skills`, `spells`, `inventory_items` | SELECT : membres. Modification : propriétaire du personnage |
| `active_buffs` | SELECT/INSERT/UPDATE : tous les membres (pour appliquer des buffs à d'autres) |
| `combats`, `combat_participants` | SELECT : membres. INSERT/UPDATE : MJ uniquement (`is_campaign_gm`) |
| `monster_library` | SELECT/modifications : créateur uniquement |
| `npcs` | SELECT : membres + selon `is_visible_to_players`. Modifications : MJ uniquement |

### Authentification

Authentification via **Supabase Auth** (email/password). Le contexte `AuthContext` expose `user`, `session`, `signIn`, `signOut`. Toutes les routes et requêtes sont protégées par le JWT Supabase.

---

*DnD Buddy — React · TypeScript · Vite · Supabase · Realtime · PostgreSQL*
