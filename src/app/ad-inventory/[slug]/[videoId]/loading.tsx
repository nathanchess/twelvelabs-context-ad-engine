import FullPageSpinner from "../../../components/FullPageSpinner";

export default function AdInventoryVideoDetailLoading() {
  return (
    <FullPageSpinner
      title="Opening video"
      description="Loading the ad creative. Analysis with Pegasus and semantic IAB starts next and can take several minutes; you will see a clear progress message on the page."
    />
  );
}
