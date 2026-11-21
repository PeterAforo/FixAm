const fs = require('fs')
const path = require('path')
const file = path.join(__dirname, '..', 'docs', 'devin-spec', 'specs', 'tasks.json')
const t = JSON.parse(fs.readFileSync(file, 'utf8'))
if (!t.phases.some((p) => p.id === 'P6')) {
  t.phases.push({
    id: 'P6',
    name: 'Discovery and customer experience',
    goal: 'Turn FixAm into a two-sided marketplace: garages get discovered, customers self-serve, and vehicle data drives matching.',
    tasks: [
      {
        id: 'P6-01',
        title: 'Vehicle catalogue',
        description: 'Ghana-relevant vehicle_makes/vehicle_models tables seeded from curated catalogue, catalog FK columns on vehicles/portal_vehicles, picker UI in staff vehicle forms and portal vehicle registration, free-text fallback preserved.',
        acceptance_criteria: [
          'Staff and customers pick make/model from dropdowns backed by the catalogue',
          'Custom makes/models still accepted as free text',
          'Catalogue is readable by authenticated users; writes are service-role only'
        ],
      },
      {
        id: 'P6-02',
        title: 'Customer self-registration',
        description: 'Portal profiles decoupled from staff customer records, customer vehicle claiming/creation from the portal, profile management, portal data isolation across garages.',
        acceptance_criteria: [
          'Customer registers via phone OTP and manages their own profile',
          'Customer sees only their own vehicles and only garages they have visited',
          'Claimed vehicles link to the matching customer record without duplicates'
        ],
      },
      {
        id: 'P6-03',
        title: 'Garage geo + public directory',
        description: 'GPS coordinates captured at onboarding (browser locate + confirm), plan-gated directory_listing feature, public /garages search with name/city/service/make/model filters, near-me distance sort, public /garages/[slug] profiles.',
        acceptance_criteria: [
          'Only active garages on plans with directory_listing appear',
          'Near-me sorts by haversine distance',
          'Public profile shows services, coverage, branches and reviews without leaking private data'
        ],
      },
      {
        id: 'P6-04',
        title: 'Service-matching search',
        description: 'garage_vehicle_coverage declares which makes/models a garage services (owner-managed in settings, catalogue or free text, audited); directory filters by vehicle; portal vehicle page lists other garages that service the car.',
        acceptance_criteria: [
          'Owner can add/remove coverage entries from settings',
          'Directory make/model filter returns only garages covering that vehicle',
          'Portal shows matching garages for a catalogued vehicle'
        ],
      },
      {
        id: 'P6-05',
        title: 'Reviews & ratings',
        description: 'Portal customers rate garages they have visited (1-5 + comment, one review per garage per phone, upsert); ratings aggregate on directory cards and public profiles; owners moderate via hide/publish in settings.',
        acceptance_criteria: [
          'Only customers of a garage can review it',
          'Resubmitting updates the existing review',
          'Hidden reviews disappear from public aggregates but remain auditable'
        ],
      },
      {
        id: 'P6-06',
        title: 'Vendor verification badge',
        description: 'Platform admin can verify approved vendors (verifiedAt/verifiedBy audited); verified badge on marketplace vendor groups, verified sellers sort first, badge on vendor dashboard and admin console.',
        acceptance_criteria: [
          'Verify requires approved status',
          'Verified badge visible to garages browsing the marketplace',
          'Verification and revocation are audit-logged'
        ],
      },
      {
        id: 'P6-07',
        title: 'Landing page upgrade',
        description: 'Dual-audience marketing page: garage CTA funnel (onboarding/pricing) and customer CTA funnel (/garages directory, /portal), feature grids, how-it-works, footer nav.',
        acceptance_criteria: [
          'Both garage and customer paths have clear CTAs',
          'Signed-in users still redirect via AuthGate'
        ],
      },
    ],
  })
  fs.writeFileSync(file, JSON.stringify(t, null, 2) + '\n')
  console.log('P6 appended with', t.phases.at(-1).tasks.length, 'tasks')
} else {
  console.log('P6 already present')
}
