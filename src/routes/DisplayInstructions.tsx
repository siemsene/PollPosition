import { ArrowLeft } from 'lucide-react'
import TopBar from '../components/TopBar'

export default function DisplayInstructions() {
  return (
    <div>
      <TopBar mode="instructor" />
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <div>
          <div className="text-2xl font-semibold">Displaying results</div>
          <div className="text-sm text-slate-400 mt-1">
            Two ways to show live graphs: the standard live link or the PowerPoint embedded link.
          </div>
        </div>

        <div className="card p-6 space-y-3">
          <div className="font-semibold">Option A: Live link (standard)</div>
          <div className="text-sm text-slate-300">
            Open the live link in a browser and keep it running in the background (behind PowerPoint).
            When you stop the presentation and minimize PowerPoint, students will see the live results.
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <div className="font-semibold">Option B: Embedded link (PowerPoint add-in)</div>
          <div className="text-sm text-slate-300">
            Download the add-in manifest and install it from a shared folder catalog in PowerPoint.
          </div>
          <div>
            <a className="btn-ghost" href="/manifest.xml" download>
              Download manifest.xml
            </a>
          </div>
          <div className="text-sm text-slate-300">
            First, prepare a shared folder for the manifest:
          </div>
          <ol className="list-decimal list-inside text-sm text-slate-300 space-y-1">
            <li>Create a folder, e.g. <span className="font-mono">C:\OfficeAddinManifests</span>.</li>
            <li>Put your <span className="font-mono">manifest.xml</span> in that folder.</li>
            <li>Share the folder: File Explorer → right-click folder → Properties → Sharing tab → Share…</li>
            <li>Add yourself (and anyone else who needs it), and ensure at least read access.</li>
            <li>Note the network (UNC) path Windows shows, like: <span className="font-mono">\\NEWPC\OfficeAddinManifests</span>.</li>
          </ol>
          <div className="text-sm text-slate-300">PowerPoint setup steps:</div>
          <ol className="list-decimal list-inside text-sm text-slate-300 space-y-1">
            <li>Open PowerPoint.</li>
            <li>File → Options.</li>
            <li>Trust Center → Trust Center Settings.</li>
            <li>Trusted Add-in Catalogs.</li>
            <li>In Catalog Url, paste the UNC path you noted (example: \\NEWPC\OfficeAddinManifests).</li>
            <li>Click Add catalog.</li>
            <li>Check Show in Menu.</li>
            <li>Click OK, then close Options.</li>
            <li>Close and reopen PowerPoint.</li>
            <li>In PowerPoint: Home → Add-ins → Advanced.</li>
            <li>Choose SHARED FOLDER.</li>
            <li>Select your add-in and click Add.</li>
          </ol>
          <div className="text-sm text-slate-300">
            After installing the add-in, create a frame in PowerPoint to display the embedded link directly.
          </div>
        </div>

        <div>
          <a className="btn-ghost" href="/admin/dashboard">
            <ArrowLeft size={16} /> Back to instructor dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
