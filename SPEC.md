# Spec.md — AR Rocket Launch Dashboard Experience

## 1. Overview
An augmented reality (AR) tabletop experience that simulates a rocket launch using a miniature launch site anchored to a real-world surface (e.g. desk).

The experience emphasizes:
- Spatial computing (no HUD)
- Physical interaction via surface contact
- Minimal, focused UI

---

## 2. Core Experience Concept

### 2.1 Spatial Setup
- Miniature rocket launch site anchored to a desk
- Includes:
  - Rocket
  - Launch tower
  - Ground pad + structures
- Scale: ~20–40 cm footprint (diorama style)

---

### 2.2 UI Philosophy
- No floating HUD
- UI is spatially anchored

Two zones:

#### A. Desktop Control Panel (Primary UI)
- Flush with desk surface
- Appears embedded/projected
- Touch interaction uses real surface for haptics

#### B. Rocket Panel (Secondary UI)
- Anchored near rocket/tower
- Minimal glanceable info

---

## 3. UI Components

### 3.1 Desktop Control Panel
- Countdown Timer (primary)
- Launch Button (high emphasis)
- Abort Button
- Mission Status
- System Status Bars:
  - Fuel
  - Engine
  - Navigation
- Weather Conditions (icons + text)

Design:
- No graphs
- Large touch targets
- High contrast

---

### 3.2 Rocket Panel
- Altitude
- Velocity (optional)
- Stage indicator
- Minimal status indicators

---

## 4. Interaction Model

### Input
- Hand tracking
- Direct touch on desk

### Interaction Types
- Tap
- Press-and-hold (launch confirm)
- Hover (optional)

### Haptics
- Passive (real desk surface)
- Visual + audio feedback

---

## 5. Experience Flow

### Idle
- Mini launch site visible
- Ambient effects (steam, lights)

### Pre-Launch
- Review mission + system status

### Countdown
- Triggered by launch button
- UI focuses on countdown
- Build-up effects (smoke, lighting)

### Launch
- Rocket lifts off from miniature pad
- Real-time updates on rocket panel

### Post-Launch
- Rocket exits or transitions
- Mission summary displayed

---

## 6. Visual Design

### Style
- Semi-realistic
- Clean, slightly futuristic UI
- Avoid game-like feel

### Lighting
- Matches real-world lighting
- Subtle UI glow

### Scale
- Strong miniature realism
- Grounded shadows + depth

---

## 7. Technical Considerations

### Anchoring
- Stable surface detection
- Persistent world locking

### Performance
- Optimize particles (smoke/fire)
- Real-time updates

### Occlusion
- UI respects surfaces
- Rocket feels grounded

---

## 8. Constraints

- No HUD
- No complex graphs
- No VR-style environments

- First-person AR only
- Spatial UI only
- Minimal information
- Strong physical grounding

---

## 9. Experience Pillars

1. Tactile Illusion  
2. Spatial Clarity  
3. Miniature Spectacle  
4. Focused Information  