# HEALTHHYR ADMIN CONTROL CENTER — COMPLETE DASHBOARD BUILD

I am building **HealthHyr**, a healthcare job marketplace connecting healthcare professionals with employers such as hospitals, clinics, nursing homes, home care agencies, and other healthcare organizations.

I need you to build a complete, production-quality **HealthHyr Admin Control Center**.

IMPORTANT:
Do not build only a visual dashboard or static mockup.

Every sidebar item must open a real page.
Every button must have a purpose.
Every table must support the appropriate actions.
Every form must work.
Every page must have loading, empty, success, and error states.
Use the existing HealthHyr backend/API/database whenever functionality already exists.
Do not create duplicate backend systems unnecessarily.

Before modifying the project:

1. Inspect the existing codebase.
2. Identify the framework, database, authentication system, API structure, existing models, employer system, job seeker system, job system, application system, training system, payment system, and messaging system.
3. Reuse existing components and APIs whenever possible.
4. Tell me which functionality already exists and which functionality needs to be added.
5. Then implement the dashboard without breaking the current HealthHyr application.

---

# 1. ADMIN LAYOUT

Create a professional healthcare SaaS admin interface.

DESIGN:

* Clean
* Modern
* Professional
* Healthcare-focused
* White/light background
* HealthHyr blue as primary brand color
* Dark navy sidebar
* Soft blue/green accents
* Rounded cards
* Subtle shadows
* Clean typography
* Responsive desktop/tablet/mobile design
* Do not overcrowd the interface

Desktop:
Fixed left sidebar + top navigation + main content.

Mobile:
Collapsible navigation/drawer.

Top navigation must contain:

* Global search
* Notifications
* Admin profile
* Admin role
* Account dropdown
* Logout

---

# 2. SIDEBAR

Create this sidebar:

Dashboard

Employers

* All Employers
* Pending Verification
* Verified Employers
* Suspended Employers

Job Seekers

* All Job Seekers
* Active Profiles
* Incomplete Profiles
* Suspended Accounts

Jobs

* All Jobs
* Active Jobs
* Pending Review
* Filled Jobs
* Closed Jobs
* Expired Jobs
* Reported Jobs

Applications

Training & Courses

* Courses
* Lessons
* Quizzes
* Certificates
* Training Categories

Payments & Plans

* Transactions
* Employer Plans
* Subscriptions
* Failed Payments
* Refunds

Reports & Analytics

Messages

Notifications

Content Management

Users & Roles

Settings

Audit Logs

Use expandable/collapsible sidebar groups where appropriate.

---

# 3. DASHBOARD HOME

Create the main Admin Overview.

Header:

"Good Morning, Admin"
"Here's what's happening on HealthHyr today."

Do not hard-code the greeting. Change it based on the current time.

Create KPI cards for:

* Total Job Seekers
* Total Employers
* Active Jobs
* Total Applications
* Revenue

Each card should show:

* Current value
* Percentage change
* Comparison with previous period

Use real database information when available.

Add date filters:

* Today
* Last 7 Days
* Last 30 Days
* Last 3 Months
* Custom Range

---

# 4. DASHBOARD ANALYTICS

Create:

APPLICATION ACTIVITY

Line chart showing:

* Applications
* Hires

USER GROWTH

Chart showing:

* New Job Seekers
* New Employers

JOB STATUS

Donut chart:

* Active
* Filled
* Closed
* Expired
* Pending

REVENUE OVERVIEW

Show:

* Monthly revenue
* Subscription revenue
* Current period
* Previous period
* Percentage change

Charts must use real database/API data when possible.

---

# 5. DASHBOARD TABLES

Add:

RECENT EMPLOYERS AWAITING VERIFICATION

Show:

* Company
* Organization type
* Date submitted
* Status
* View
* Approve
* Reject

RECENT JOB POSTS

Show:

* Job title
* Employer
* Location
* Date posted
* Status
* View

RECENT APPLICATIONS

Show:

* Applicant
* Position
* Employer
* Application date
* Status
* View

TOP LOCATIONS

Show the locations with the most job postings.

TOP JOB CATEGORIES

Examples:

* Home Health Aide
* CNA
* PCA
* Registered Nurse
* LPN

QUICK ACTIONS

Create:

* Review Employers
* Manage Jobs
* Training Content
* View Messages

---

# 6. EMPLOYERS

Clicking Employers must open the Employer Management system.

ALL EMPLOYERS

Create searchable/filterable table.

Columns:

* Company Logo
* Company Name
* Organization Type
* Contact Person
* Email
* Phone
* Location
* Number of Jobs
* Subscription Plan
* Verification Status
* Account Status
* Joined Date
* Actions

Search by:

* Company
* Email
* Contact person

Filters:

* Organization type
* State
* Verification status
* Account status
* Subscription
* Registration date

ADMIN ACTIONS:

View Employer
Edit Employer
Verify Employer
Reject Verification
Suspend Account
Reactivate Account
Delete Account

Require confirmation before destructive actions.

---

# 7. EMPLOYER DETAIL PAGE

Clicking an employer should open a complete profile.

Tabs:

OVERVIEW
COMPANY PROFILE
JOBS
APPLICANTS
SUBSCRIPTION
PAYMENTS
DOCUMENTS
ACTIVITY

Overview should show:

* Company information
* Verification
* Number of jobs
* Applications received
* Hires
* Subscription
* Account status

COMPANY PROFILE:

* Company name
* Organization type
* Address
* City
* State
* ZIP
* Phone
* Email
* Website
* Description
* Logo

DOCUMENTS:
Allow admins to review verification documents.

Admin can:
Approve
Reject
Request Additional Information

When rejecting, require a reason.

Keep verification history.

---

# 8. JOB SEEKERS

Create Job Seeker Management.

Table columns:

* Profile Photo
* Name
* Profession
* Email
* Phone
* Location
* Profile Completion
* Applications
* Certifications
* Account Status
* Joined Date
* Actions

Filters:

* Profession
* State
* Account status
* Profile completion
* Certification status
* Registration date

Search:

* Name
* Email
* Phone

Actions:

* View Profile
* Edit
* View Applications
* View Certifications
* Suspend
* Reactivate
* Delete

---

# 9. JOB SEEKER DETAIL

Create tabs:

Overview
Personal Information
Experience
Education
Certifications
Applications
Saved Jobs
Training
Activity

Show profile completion percentage.

CERTIFICATIONS

Display:

* Certification
* License number if applicable
* State
* Issue date
* Expiration date
* Uploaded document
* Verification status

Admin actions:

* Verify
* Reject
* Request Information

Do not expose private information to unauthorized admin roles.

---

# 10. JOB MANAGEMENT

Create Jobs Management.

Table:

Job Title
Employer
Location
Job Type
Category
Salary/Pay
Applications
Posted Date
Expiration
Status
Actions

Statuses:

Draft
Pending Review
Active
Filled
Closed
Expired
Rejected
Reported

Filters:

* Status
* Employer
* Category
* Job type
* State
* Date

Admin actions:

* View
* Edit
* Approve
* Reject
* Close
* Reopen
* Remove

When rejecting or removing a job, require an admin reason.

---

# 11. JOB DETAIL

Show:

Job title
Employer
Location
Salary
Schedule
Job type
Description
Requirements
Benefits
Qualifications
Posted date
Expiration
Number of applications
Job status

Admin should be able to see applicants associated with the job.

---

# 12. APPLICATIONS

Create centralized Application Management.

Columns:

Applicant
Job
Employer
Application Date
Current Stage
Last Updated
Actions

Application pipeline:

Applied
Under Review
Interview
Offer
Hired
Rejected
Withdrawn

Add filters:

* Employer
* Job
* Status
* Date
* Location

Clicking an application opens application details and timeline.

Do not allow admins to silently change employer hiring decisions unless the platform's business rules explicitly permit it.

---

# 13. TRAINING & COURSES

HealthHyr will provide healthcare training content.

Create Training Management.

Admin can:

* Create course
* Edit course
* Publish/unpublish
* Archive course

Course fields:

* Title
* Description
* Category
* Thumbnail
* Instructor
* Level
* Duration
* Status

Examples:

* PCA Fundamentals
* Client Rights, Privacy & HIPAA Basics
* Infection Control
* Hoyer Lift Training
* Safety & Emergency Procedures

---

# 14. COURSE BUILDER

Each course can contain multiple lessons.

Admin can:

* Add lesson
* Reorder lessons
* Edit lesson
* Delete lesson

Lesson types:

* Video
* Text
* PDF/resource
* Quiz

Fields:

* Lesson title
* Description
* Video URL/upload
* Duration
* Order
* Required/optional

Track learner progress.

---

# 15. QUIZZES

Admin can create quizzes.

Question types:

* Multiple Choice
* True/False

For multiple choice:
Question
A
B
C
D
Correct Answer
Explanation

Configure:

* Passing score
* Number of attempts
* Randomize questions
* Show explanation after answer

Track:

* Attempts
* Scores
* Pass/fail

---

# 16. CERTIFICATES

Create Certificate Management.

Show:

* Student
* Course
* Completion date
* Score
* Certificate ID
* Status

Certificates should have a unique verification ID.

Allow:

* View
* Download
* Reissue
* Revoke

If possible, create a public certificate verification page using certificate ID.

---

# 17. PAYMENTS & PLANS

Create financial management for HealthHyr.

EMPLOYER PLANS

Manage:

* Plan name
* Monthly price
* Yearly price
* Features
* Job posting limits
* Status

SUBSCRIPTIONS

Show:

* Employer
* Plan
* Billing cycle
* Amount
* Start date
* Renewal date
* Status

Statuses:
Active
Trial
Past Due
Canceled
Expired

TRANSACTIONS

Show:
Transaction ID
Employer
Amount
Payment method
Date
Status

Do not store raw credit/debit card details.

Use the existing payment provider securely.

REFUNDS

Admin can review refund records.

If refund functionality already exists through the payment provider, integrate with the existing flow rather than creating a fake refund system.

---

# 18. REPORTS & ANALYTICS

Create reporting dashboard.

Reports:

* User Growth
* Employer Growth
* Job Seeker Growth
* Job Posting Trends
* Application Trends
* Hiring Trends
* Revenue
* Subscription Performance
* Top Job Categories
* Top Locations
* Training Completion

Date filters:
7 days
30 days
90 days
6 months
1 year
Custom

Allow CSV export where appropriate.

---

# 19. MESSAGES

Create Admin Message Center.

Inbox
Sent
Archived

Admin can communicate with users where permitted.

Show:

* Sender
* Recipient
* Subject
* Message
* Timestamp
* Read/unread status

Include search.

Do not expose private conversations to admin roles that do not have permission.

---

# 20. NOTIFICATIONS

Create Notification Center.

Types:

* New Employer Registration
* Employer Verification Request
* New Job
* Reported Job
* Payment Failure
* New Support Request
* Certification issue
* System alert

Admin can:

* Mark read
* Mark all read
* Open related item
* Delete/archive notification

Add notification badge to top navigation.

---

# 21. CONTENT MANAGEMENT

Allow admin to manage public HealthHyr content without editing code.

Sections:

* Homepage
* About
* FAQ
* Help Center
* Terms
* Privacy
* Job Seeker Resources
* Employer Resources

Where appropriate allow:

* Title
* Content
* Image
* SEO title
* Meta description
* Publish status

---

# 22. USERS & ROLES

Build Role-Based Access Control.

Default roles:

SUPER ADMIN
Full platform access.

ADMIN
General operational management.

EMPLOYER VERIFICATION ADMIN
Employer verification only.

CONTENT MANAGER
Training and website content.

SUPPORT ADMIN
Messages/support/user assistance.

FINANCE ADMIN
Payments, subscriptions, financial reports.

Create permissions such as:

employer.view
employer.edit
employer.verify

jobseeker.view
jobseeker.edit

job.view
job.edit
job.approve

training.view
training.manage

payment.view
payment.refund

reports.view

messages.view
messages.send

users.manage

settings.manage

audit.view

Hide sidebar items when the logged-in admin does not have permission.

Also protect backend API routes.

Never rely only on hiding frontend buttons for security.

---

# 23. SETTINGS

Create settings categories:

GENERAL

* Platform name
* Support email
* Contact information
* Logo
* Timezone

JOBS

* Default job expiration
* Require admin job approval
* Job posting rules

EMPLOYERS

* Require verification
* Required documents

TRAINING

* Certificate settings
* Passing score defaults

NOTIFICATIONS

* Email notification settings
* Platform notifications

SECURITY

* Session settings
* Admin security options

Do not expose API secrets or environment variables in the browser.

---

# 24. AUDIT LOGS

This section is extremely important.

Track sensitive admin actions.

Examples:

Employer verified
Employer suspended
Job removed
User suspended
Role changed
Subscription changed
Refund initiated
Course deleted
Certificate revoked
Settings changed

Store:

Admin
Action
Target
Target ID
Date/time
IP address if available and appropriate
Relevant metadata

Audit logs should be read-only to normal admins.

Do not allow admins to manually delete individual security audit records from the dashboard.

---

# 25. GLOBAL SEARCH

The top search bar should search:

Employers
Job Seekers
Jobs
Applications

Display grouped results.

Example:

Employers
Sunrise Care Center

Job Seekers
Marie Louis

Jobs
PCA — Boston

Clicking a result should navigate to its detail page.

---

# 26. TABLE SYSTEM

Create reusable table components.

Support:

* Search
* Filters
* Sorting
* Pagination
* Page size
* Loading state
* Empty state
* Error state

For large datasets, perform pagination/filtering server-side where appropriate.

---

# 27. CONFIRMATION MODALS

Require confirmation before:

Delete user
Suspend employer
Suspend job seeker
Delete job
Remove job
Refund payment
Delete course
Revoke certificate
Change critical settings

Use clear confirmation messages.

For highly destructive actions, require the admin to type a confirmation word where appropriate.

---

# 28. STATUS BADGES

Use consistent badges.

Green:
Active
Verified
Hired
Paid
Published

Yellow:
Pending
Under Review
Past Due

Blue:
Interview
New
Processing

Red:
Suspended
Rejected
Failed
Expired
Revoked

Gray:
Draft
Closed
Archived

---

# 29. RESPONSIVE DESIGN

Desktop:
Full sidebar.

Tablet:
Collapsible sidebar.

Mobile:
Drawer navigation.

Tables should transform appropriately on small screens.

Do not simply shrink desktop tables until they become unreadable.

---

# 30. SECURITY

Admin routes must require authentication.

Implement:

* Server-side authorization
* Role-based permissions
* Input validation
* Secure API endpoints
* Rate limiting where appropriate
* Safe file upload validation
* Secure password handling
* Audit logging
* Protection against unauthorized record access

Never expose:

* Password hashes
* API secrets
* Payment secrets
* Authentication tokens
* Sensitive environment variables

---

# 31. DATABASE

Before adding tables, inspect the existing database schema.

Reuse existing:
Users
Employers
Job Seekers
Jobs
Applications
Payments
Subscriptions
Messages

Add only missing models required for:

Admin roles
Permissions
Training
Courses
Lessons
Quizzes
Quiz attempts
Certificates
Notifications
Audit logs
Verification history

Do not create duplicate User, Employer, Job, or Application models if they already exist.

Create migrations safely.

---

# 32. PERFORMANCE

HealthHyr must remain fast.

Use:

* Server-side pagination
* Optimized database queries
* Proper indexes
* Lazy loading
* Image optimization
* Query caching where appropriate
* Skeleton loading states

Do not load thousands of records into the browser at once.

---

# 33. ERROR HANDLING

Every important operation must provide feedback.

Examples:

"Employer verified successfully."

"Job has been suspended."

"Unable to process this request. Please try again."

"Course published successfully."

Never fail silently.

---

# 34. FINAL ROUTE STRUCTURE

Use the project's existing routing convention, but conceptually the Admin Control Center should include routes similar to:

/admin
/admin/employers
/admin/employers/[id]

/admin/job-seekers
/admin/job-seekers/[id]

/admin/jobs
/admin/jobs/[id]

/admin/applications
/admin/applications/[id]

/admin/training
/admin/training/courses
/admin/training/courses/[id]
/admin/training/quizzes
/admin/training/certificates

/admin/payments
/admin/payments/transactions
/admin/payments/plans
/admin/payments/subscriptions
/admin/payments/refunds

/admin/reports

/admin/messages

/admin/notifications

/admin/content

/admin/users
/admin/roles

/admin/settings

/admin/audit-logs

---

# IMPORTANT IMPLEMENTATION RULE

Do NOT try to rebuild the entire application blindly in one massive change.

First audit the existing HealthHyr codebase.

Then provide:

1. Existing functionality discovered
2. Missing functionality
3. Database changes required
4. API changes required
5. Pages/components required
6. Security/permission changes
7. Implementation order

Then implement the Admin Control Center in phases.

PHASE 1:
Admin shell + authentication + permissions + dashboard overview.

PHASE 2:
Employers + verification.

PHASE 3:
Job Seekers.

PHASE 4:
Jobs + Applications.

PHASE 5:
Training + Courses + Quizzes + Certificates.

PHASE 6:
Payments + Plans.

PHASE 7:
Messages + Notifications.

PHASE 8:
Reports + Content Management.

PHASE 9:
Users + Roles + Settings + Audit Logs.

After each phase:

* Run TypeScript/build checks
* Run relevant tests
* Fix errors
* Verify existing HealthHyr functionality still works

Do not use fake functionality in the final production implementation.

If real backend functionality is not yet available for a button, clearly identify it instead of pretending the action works.

The final result should feel like a real professional healthcare marketplace administration platform, not a generic dashboard template.