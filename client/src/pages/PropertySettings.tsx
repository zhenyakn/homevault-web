import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Home, Settings, MapPin } from "lucide-react";
import { toast } from "sonner";
import { MapView } from "@/components/Map";

export default function PropertySettings() {
  const utils = trpc.useUtils();
  const { data: property, isLoading } = trpc.property.get.useQuery();
  const updateProperty = trpc.property.update.useMutation({
    onSuccess: () => {
      toast.success("Property settings updated successfully");
      utils.property.get.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to update property: ${error.message}`);
    },
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  const [formData, setFormData] = useState({
    houseName: "",
    houseNickname: "",
    address: "",
    latitude: "",
    longitude: "",
    purchaseDate: "",
    purchasePrice: 0,
    squareMeters: 0,
    rooms: 0,
    yearBuilt: 0,
    floor: 0,
    parkingSpots: 0,
    hasStorage: false,
    currency: "₪",
    currencyCode: "ILS",
    timezone: "Asia/Jerusalem",
  });

  useEffect(() => {
    if (property) {
      setFormData({
        houseName: property.houseName || "",
        houseNickname: property.houseNickname || "",
        address: property.address || "",
        latitude: property.latitude ? String(property.latitude) : "",
        longitude: property.longitude ? String(property.longitude) : "",
        purchaseDate: property.purchaseDate || "",
        purchasePrice: property.purchasePrice ? property.purchasePrice / 100 : 0,
        squareMeters: property.squareMeters || 0,
        rooms: property.rooms || 0,
        yearBuilt: property.yearBuilt || 0,
        floor: property.floor || 0,
        parkingSpots: property.parkingSpots || 0,
        hasStorage: property.hasStorage || false,
        currency: property.currency || "₪",
        currencyCode: property.currencyCode || "ILS",
        timezone: property.timezone || "Asia/Jerusalem",
      });
    }
  }, [property]);

  const geocodeAddress = useCallback(() => {
    if (!mapRef.current || !formData.address) return;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: formData.address }, (results, status) => {
      if (status === "OK" && results && results[0] && mapRef.current) {
        const location = results[0].geometry.location;
        mapRef.current.setCenter(location);
        mapRef.current.setZoom(16);
        if (markerRef.current) {
          markerRef.current.position = location;
        } else {
          markerRef.current = new google.maps.marker.AdvancedMarkerElement({
            map: mapRef.current,
            position: location,
            title: formData.houseName || "My Home",
          });
        }
        // Save coordinates so the map can load from stored lat/lng on next visit
        setFormData((prev) => ({
          ...prev,
          latitude: String(location.lat()),
          longitude: String(location.lng()),
        }));
      }
    });
  }, [formData.address, formData.houseName]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    if (formData.address) {
      geocodeAddress();
    }
  }, [formData.address, geocodeAddress]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  };

  const handleCheckedChange = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      hasStorage: checked,
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProperty.mutate({
      ...formData,
      purchasePrice: Math.round(formData.purchasePrice * 100),
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Property Settings</h1>
        <p className="text-muted-foreground">Manage your property details and preferences.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-5 w-5" />
                Property Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="houseName">House Name</Label>
                <Input
                  id="houseName"
                  name="houseName"
                  value={formData.houseName}
                  onChange={handleChange}
                  placeholder="e.g. The Villa"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="houseNickname">House Nickname</Label>
                <Input
                  id="houseNickname"
                  name="houseNickname"
                  value={formData.houseNickname}
                  onChange={handleChange}
                  placeholder="e.g. Home"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <div className="flex gap-2">
                  <Textarea
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Full address"
                    rows={2}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={geocodeAddress}
                    className="self-end"
                  >
                    <MapPin className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purchaseDate">Purchase Date</Label>
                  <Input
                    id="purchaseDate"
                    name="purchaseDate"
                    type="date"
                    value={formData.purchaseDate}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchasePrice">Purchase Price</Label>
                  <Input
                    id="purchasePrice"
                    name="purchasePrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Physical Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="squareMeters">Square Meters</Label>
                  <Input
                    id="squareMeters"
                    name="squareMeters"
                    type="number"
                    min="0"
                    value={formData.squareMeters}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rooms">Rooms</Label>
                  <Input
                    id="rooms"
                    name="rooms"
                    type="number"
                    min="0"
                    step="0.5"
                    value={formData.rooms}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="yearBuilt">Year Built</Label>
                  <Input
                    id="yearBuilt"
                    name="yearBuilt"
                    type="number"
                    min="1800"
                    max={new Date().getFullYear()}
                    value={formData.yearBuilt}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="floor">Floor</Label>
                  <Input
                    id="floor"
                    name="floor"
                    type="number"
                    value={formData.floor}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parkingSpots">Parking Spots</Label>
                  <Input
                    id="parkingSpots"
                    name="parkingSpots"
                    type="number"
                    min="0"
                    value={formData.parkingSpots}
                    onChange={handleChange}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="hasStorage"
                  checked={formData.hasStorage}
                  onCheckedChange={handleCheckedChange}
                />
                <Label htmlFor="hasStorage" className="font-normal">
                  Has Storage Unit
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Google Map */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Property Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MapView
                className="h-[350px] rounded-lg overflow-hidden"
                initialCenter={{ lat: 32.0853, lng: 34.7818 }}
                initialZoom={12}
                onMapReady={handleMapReady}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Enter your address above and click the pin icon to locate your property on the map.
              </p>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency Symbol</Label>
                  <Input
                    id="currency"
                    name="currency"
                    value={formData.currency}
                    onChange={handleChange}
                    placeholder="e.g. ₪, $, €"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currencyCode">Currency Code</Label>
                  <Select
                    value={formData.currencyCode}
                    onValueChange={(val) => handleSelectChange("currencyCode", val)}
                  >
                    <SelectTrigger id="currencyCode">
                      <SelectValue placeholder="Select currency code" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ILS">ILS (Israeli New Shekel)</SelectItem>
                      <SelectItem value="USD">USD (US Dollar)</SelectItem>
                      <SelectItem value="EUR">EUR (Euro)</SelectItem>
                      <SelectItem value="GBP">GBP (British Pound)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select
                    value={formData.timezone}
                    onValueChange={(val) => handleSelectChange("timezone", val)}
                  >
                    <SelectTrigger id="timezone">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Jerusalem">Asia/Jerusalem</SelectItem>
                      <SelectItem value="America/New_York">America/New_York</SelectItem>
                      <SelectItem value="Europe/London">Europe/London</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={updateProperty.isPending}>
            {updateProperty.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
