"use client";

// ============================================
// Merchant Impact Page - Environmental Impact
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import {
  Leaf,
  Droplets,
  TreePine,
  Award,
  TrendingUp,
  Target,
  Loader2,
} from "lucide-react";
import { getMerchantImpactStats } from "@/services";
import { AVG_MEAL_WEIGHT_KG, co2KgToCarKm, co2KgToTrees } from "@/lib/impactCalculations";
import type { MerchantImpact } from "@/types";

const MerchantImpactPage = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [impact, setImpact] = useState<MerchantImpact | null>(null);

  const merchantId = "mock-merchant-id";

  useEffect(() => {
    loadImpact();
  }, []);

  const loadImpact = async () => {
    setIsLoading(true);
    const result = await getMerchantImpactStats(merchantId);
    if (result.success && result.data) {
      setImpact(result.data);
    }
    setIsLoading(false);
  };

  const co2Saved = impact?.co2_avoided_kg || 0;
  const mealsSaved = impact?.total_meals_saved
    ?? Math.round((impact?.food_saved_kg || 0) / AVG_MEAL_WEIGHT_KG);

  const impactStats = [
    {
      icon: Leaf,
      value: `${impact?.food_saved_kg?.toFixed(0) || 0} kg`,
      label: "Nourriture sauvée",
      description: `Équivalent à ${mealsSaved.toLocaleString("fr-FR")} repas`,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      icon: Droplets,
      value: `${co2Saved.toFixed(0)} kg`,
      label: "CO₂ évité",
      description: `Équivalent à ${co2KgToCarKm(co2Saved).toLocaleString("fr-FR")} km en voiture`,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      icon: TreePine,
      value: `${co2KgToTrees(co2Saved)}`,
      label: "Arbres équivalents",
      description: "Absorption CO₂ annuelle",
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      icon: Award,
      value: `${impact?.waste_reduction_rate || 0}%`,
      label: "Taux de récupération",
      description: "De vos invendus sauvés",
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
  ];

  const milestones = [
    { label: "Premiers 10kg sauvés", achieved: true, reward: "Badge Bronze" },
    { label: "50kg de nourriture", achieved: true, reward: "Badge Argent" },
    { label: "100kg de nourriture", achieved: true, reward: "Badge Or" },
    { label: "500kg de nourriture", achieved: false, reward: "Badge Platine" },
    { label: "1 tonne sauvée", achieved: false, reward: "Partenaire Elite" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6 lg:p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Impact environnemental</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Votre contribution à la lutte contre le gaspillage
        </p>
      </div>
      {/* Hero Impact */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
                <Leaf className="w-8 h-8 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">
                  Éco-Héros ouyaboung
                </h2>
                <Badge variant="secondary" className="mt-1">
                  Niveau Or • Top 10% des commerçants
                </Badge>
              </div>
            </div>
            <p className="text-muted-foreground">
              Grâce à votre engagement, vous contribuez activement à réduire le
              gaspillage alimentaire au Gabon. Continuez ainsi !
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Impact Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {impactStats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="h-full">
              <CardContent className="p-4">
                <div
                  className={`w-12 h-12 ${stat.bgColor} rounded-xl flex items-center justify-center mb-3`}
                >
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-foreground font-medium">{stat.label}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Milestones */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Objectifs & Récompenses
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {milestones.map((milestone, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-4 p-3 rounded-xl ${
                    milestone.achieved ? "bg-primary/10" : "bg-muted/50"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      milestone.achieved
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted-foreground/20 text-muted-foreground"
                    }`}
                  >
                    {milestone.achieved ? (
                      <Award className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-bold">{index + 1}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className={`font-medium ${
                        milestone.achieved
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {milestone.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {milestone.reward}
                    </p>
                  </div>
                  {milestone.achieved && (
                    <Badge variant="default" className="bg-primary">
                      Atteint
                    </Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Monthly Progress */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Objectif mensuel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    Nourriture sauvée
                  </span>
                  <span className="text-sm font-medium">
                    {impact?.food_saved_kg?.toFixed(0) || 0} / 200 kg
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    ((impact?.food_saved_kg || 0) / 200) * 100,
                    100
                  )}
                  className="h-3"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    Commandes réalisées
                  </span>
                  <span className="text-sm font-medium">
                    {impact?.orders_fulfilled || 0} / 500
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    ((impact?.orders_fulfilled || 0) / 500) * 100,
                    100
                  )}
                  className="h-3"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    Taux de récupération
                  </span>
                  <span className="text-sm font-medium">
                    {impact?.waste_reduction_rate || 0}% / 90%
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    ((impact?.waste_reduction_rate || 0) / 90) * 100,
                    100
                  )}
                  className="h-3"
                />
              </div>

              <div className="p-4 bg-primary/10 rounded-xl text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  Prochain badge
                </p>
                <p className="font-bold text-primary text-lg">Badge Platine</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Plus que 350kg pour atteindre 500kg !
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default MerchantImpactPage;
